const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const BASE_URL = 'https://portal.buenavistacommunitycollege.edu.ph';

app.use(cors());
app.use(express.json());

// Serve React build in production
app.use(express.static(path.join(__dirname, '../client/build')));

// Shared axios instance — maintains cookies across requests in a session
const httpClient = axios.create({
  timeout: 20000,
  maxRedirects: 5,
  withCredentials: true,
  headers: {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Referer': BASE_URL + '/',
  }
});

// Cookie jar (shared per process — good enough for a personal-use tool)
let sessionCookies = '';

async function fetchPage(url) {
  const headers = {};
  if (sessionCookies) headers['Cookie'] = sessionCookies;

  const response = await httpClient.get(url, { headers });

  // Capture any set-cookie headers
  const setCookie = response.headers['set-cookie'];
  if (setCookie) {
    const newCookies = setCookie
      .map(c => c.split(';')[0])
      .join('; ');
    sessionCookies = newCookies;
  }

  return response.data;
}

// Detect if we landed on a login page
function isLoginPage(html) {
  const lower = html.toLowerCase();
  return (
    lower.includes('name="username"') ||
    lower.includes('name="password"') ||
    lower.includes('login') && lower.includes('<form') && !lower.includes('viewgradesstu')
  );
}

// ── Enrollment scraper ────────────────────────────────────────────────────────

app.get('/api/enrollments/:studentId', async (req, res) => {
  const { studentId } = req.params;

  try {
    const url = `${BASE_URL}/students/enroll/student/${encodeURIComponent(studentId)}/`;
    const html = await fetchPage(url);

    if (isLoginPage(html)) {
      return res.status(401).json({ error: 'The portal returned a login page. Session may have expired.' });
    }

    const $ = cheerio.load(html);

    // ── Extract full student name ────────────────────────────────────────────
    let studentName = '';

    // Try common name selectors used by school portals
    const nameCandidates = [
      $('h1').first().text().trim(),
      $('h2').first().text().trim(),
      $('h3').first().text().trim(),
      $('.student-name').first().text().trim(),
      $('[class*="name"]').first().text().trim(),
      $('td:contains("Name")').next('td').text().trim(),
      $('td:contains("Student Name")').next('td').text().trim(),
      $('th:contains("Name")').next('th').text().trim(),
    ];

    for (const candidate of nameCandidates) {
      if (candidate && candidate.length > 3 && candidate.length < 100 &&
          !/dashboard|portal|enrollment|subject|grade/i.test(candidate)) {
        studentName = candidate;
        break;
      }
    }

    // Fallback: scan for a name pattern (First Last or Last, First) in visible text
    if (!studentName) {
      $('p, span, div, td, li').each((_, el) => {
        if (studentName) return;
        const el$ = $(el);
        if (el$.children().length > 0) return; // leaf node only
        const txt = el$.text().trim();
        // Name-like: 2–5 words, all alpha/space, proper case
        if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}$/.test(txt)) {
          studentName = txt;
        }
        // "LASTNAME, FIRSTNAME MIDDLENAME" all-caps style
        if (!studentName && /^[A-Z]+,\s+[A-Z]+/.test(txt) && txt.length < 60) {
          studentName = txt;
        }
      });
    }

    // ── Extract enrollments ───────────────────────────────────────────────────
    const enrollments = [];

    $('a[href*="https://portal.buenavistacommunitycollege.edu.ph/students/viewGradesStudent/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/viewGradesStudent\/(\d+)/);
      if (!match) return;

      const enrollmentId = match[1];
      const $row = $(el).closest('tr');
      const cells = $row.find('td').map((_, td) => $(td).text().trim()).get();
      const rowText = $row.text().replace(/\s+/g, ' ').trim();

      let schoolYear = '', semester = '', yearLevel = '', course = '';

      const yearMatch = rowText.match(/\b(20\d{2}[-–]20\d{2})\b/);
      if (yearMatch) schoolYear = yearMatch[1];

      const semMatch = rowText.match(/\b(1st|2nd|3rd|Summer)\b/i);
      if (semMatch) semester = semMatch[1];

      const yearLvlMatch = rowText.match(/\b(\d+(?:st|nd|rd|th)\s+Year)\b/i);
      if (yearLvlMatch) yearLevel = yearLvlMatch[1];

      cells.forEach(cell => {
        if (!schoolYear && /20\d{2}/.test(cell)) schoolYear = cell.match(/20\d{2}[-–]20\d{2}/)?.[0] || '';
        if (!semester && /(1st|2nd|Summer)/i.test(cell)) semester = cell;
        if (!yearLevel && /\d+.*(year)/i.test(cell)) yearLevel = cell;
        if (!course && /BS|AB|BEEd|BEd|BSIT|BSCS|BEED|BS /i.test(cell)) course = cell;
      });

      if (!enrollments.find(e => e.enrollmentId === enrollmentId)) {
        enrollments.push({
          enrollmentId,
          schoolYear: schoolYear || 'N/A',
          semester: semester || 'N/A',
          yearLevel: yearLevel || '',
          course: course || '',
          href
        });
      }
    });

    // Fallback: table rows
    if (enrollments.length === 0) {
      $('table tbody tr').each((_, row) => {
        const cells = $(row).find('td').map((_, td) => $(td).text().trim()).get();
        const link = $(row).find('a[href*="viewGradesStudent"]').attr('href') || '';
        const match = link.match(/viewGradesStudent\/(\d+)/);
        if (match && cells.length > 0) {
          enrollments.push({
            enrollmentId: match[1],
            schoolYear: cells[0] || 'N/A',
            semester: cells[1] || 'N/A',
            yearLevel: cells[2] || '',
            course: cells[3] || '',
            href: link
          });
        }
      });
    }

    if (enrollments.length === 0) {
      return res.status(404).json({
        error: 'No enrollment records found. Check if the student ID is correct.'
      });
    }

    res.json({ studentId, studentName, enrollments });

  } catch (err) {
    console.error('Enrollment fetch error:', err.message);
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'Student ID not found.' });
    }
    res.status(500).json({ error: 'Could not reach the portal. Try again later.' });
  }
});

// ── Grades scraper ────────────────────────────────────────────────────────────

app.get('/api/grades/:enrollmentId', async (req, res) => {
  const { enrollmentId } = req.params;

  try {
    const url = `${BASE_URL}/students/viewGradesStudent/${enrollmentId}/`;
    const html = await fetchPage(url);

    if (isLoginPage(html)) {
      return res.status(401).json({
        error: 'The portal requires a login session to view grade details. Try refreshing the enrollment list first.'
      });
    }

    const $ = cheerio.load(html);

    const grades = [];
    let gwa = '';
    let remarks = '';
    let studentInfo = {};

    // ── Extract student info from definition lists or header tables ──────────
    // Pattern 1: label/value pairs in any table
    $('table').each((_, table) => {
      $(table).find('tr').each((_, row) => {
        const tds = $(row).find('td, th');
        if (tds.length >= 2) {
          const label = $(tds[0]).text().trim().toLowerCase();
          const value = $(tds[1]).text().trim();
          if (!value) return;
          if (/name/.test(label) && !studentInfo.name) studentInfo.name = value;
          if (/(course|program|degree)/.test(label) && !studentInfo.course) studentInfo.course = value;
          if (/year.level/.test(label) && !studentInfo.yearLevel) studentInfo.yearLevel = value;
          if (/semester/.test(label) && !studentInfo.semester) studentInfo.semester = value;
          if (/school.year/.test(label) && !studentInfo.schoolYear) studentInfo.schoolYear = value;
        }
      });
    });

    // Pattern 2: dl/dt/dd
    $('dl').each((_, dl) => {
      $(dl).find('dt').each((_, dt) => {
        const label = $(dt).text().trim().toLowerCase();
        const value = $(dt).next('dd').text().trim();
        if (/name/.test(label) && !studentInfo.name) studentInfo.name = value;
        if (/(course|program)/.test(label) && !studentInfo.course) studentInfo.course = value;
      });
    });

    // Pattern 3: scan paragraphs/spans for name-like text
    if (!studentInfo.name) {
      $('h1, h2, h3, h4, p, .student-name, [class*="name"]').each((_, el) => {
        if (studentInfo.name) return;
        const txt = $(el).text().trim();
        if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}$/.test(txt) && txt.length < 80) {
          studentInfo.name = txt;
        }
        if (!studentInfo.name && /^[A-Z]+,\s+[A-Z]+/.test(txt) && txt.length < 80) {
          studentInfo.name = txt;
        }
      });
    }

    // ── Extract grade rows ────────────────────────────────────────────────────
    // Find the grades table — look for a table with subject-code-like content
    $('table').each((_, table) => {
      const $table = $(table);
      const headerText = $table.find('thead, tr').first().text().toLowerCase();

      // Skip info tables (usually short, contain "name", "course")
      const isMeta = /name|student|course|program|year level|school year/i.test(headerText) &&
        $table.find('tr').length < 6;
      if (isMeta) return;

      $table.find('tbody tr, tr').each((_, row) => {
        const cells = $(row).find('td').map((_, td) => $(td).text().trim()).get();
        if (cells.length < 2) return;

        const rowText = cells.join(' ').toLowerCase();

        // Detect GWA row
        if (/gwa|general weighted|weighted average/.test(rowText)) {
          const numMatch = cells.join(' ').match(/\b\d\.\d{2,4}\b/);
          if (numMatch) gwa = numMatch[0];
          const remarkMatch = cells.find(c => /passed|failed|incomplete/i.test(c));
          if (remarkMatch) remarks = remarkMatch;
          return;
        }

        // Skip header rows
        if (/subject|description|units|midterm|final|grade|remarks/i.test(cells[0])) return;

        // Detect subject rows
        // Cell[0] looks like a subject code: "BEED 101", "NSTP 1", "ENG101", etc.
        const looksLikeSubject =
          /^[A-Z]{2,}[\s\-]?\d/.test(cells[0]) ||   // "BEED 101", "CS101"
          /^[A-Z]{3,}\d/.test(cells[0]) ||            // "MATH1"
          (/^[A-Z]/.test(cells[0]) && cells[0].length < 25 && cells.length >= 4);

        if (looksLikeSubject && cells[0]) {
          // Column mapping: try to detect dynamically
          // Typical: Code | Description | Units | Midterm | Final | Final Grade | Remarks
          // Some portals: Code | Description | Units | Grade | Remarks
          const entry = {
            subjectCode: cells[0] || '',
            subjectTitle: cells[1] || '',
            units: '',
            midterm: '',
            finals: '',
            finalGrade: '',
            remarks: ''
          };

          // Assign numeric columns
          const numericCols = cells.slice(2).map((c, i) => ({
            index: i + 2,
            value: c,
            isNum: /^\d+(\.\d+)?$/.test(c.trim()),
            isRemark: /passed|failed|incomplete|inc\.|drp|dropped|w\/d/i.test(c),
          }));

          const nums = numericCols.filter(c => c.isNum);
          const remarkCol = numericCols.find(c => c.isRemark);

          if (nums.length === 1) {
            entry.finalGrade = nums[0].value;
          } else if (nums.length === 2) {
            // units + final grade  OR  midterm + final
            if (parseFloat(nums[0].value) <= 6) {
              entry.units = nums[0].value;
              entry.finalGrade = nums[1].value;
            } else {
              entry.midterm = nums[0].value;
              entry.finalGrade = nums[1].value;
            }
          } else if (nums.length === 3) {
            entry.units = nums[0].value;
            entry.midterm = nums[1].value;
            entry.finalGrade = nums[2].value;
          } else if (nums.length >= 4) {
            entry.units = nums[0].value;
            entry.midterm = nums[1].value;
            entry.finals = nums[2].value;
            entry.finalGrade = nums[3].value;
          }

          if (remarkCol) entry.remarks = remarkCol.value;

          // fallback: last non-numeric cell if still no grade
          if (!entry.finalGrade) {
            const last = cells[cells.length - 1];
            if (/\d/.test(last)) entry.finalGrade = last;
          }

          grades.push(entry);
        }
      });
    });

    // Deduplicate by subjectCode
    const seen = new Set();
    const uniqueGrades = grades.filter(g => {
      if (seen.has(g.subjectCode)) return false;
      seen.add(g.subjectCode);
      return true;
    });

    res.json({
      enrollmentId,
      studentInfo,
      grades: uniqueGrades,
      gwa,
      remarks,
      rawAvailable: uniqueGrades.length > 0
    });

  } catch (err) {
    console.error('Grades fetch error:', err.message);
    res.status(500).json({ error: 'Could not fetch grades. Try again later.' });
  }
});

// Catch-all: serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BCC Portal server running on port ${PORT}`);
});

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

async function fetchPage(url) {
  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });
  return response.data;
}

// GET /api/enrollments/:studentId
app.get('/api/enrollments/:studentId', async (req, res) => {
  const { studentId } = req.params;

  try {
    const url = `${BASE_URL}/students/enroll/student/${studentId}/`;
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    // Extract student name from page
    let studentName = '';
    const nameEl = $('h1, h2, h3, .student-name, .name').first();
    if (nameEl.length) studentName = nameEl.text().trim();
    if (!studentName) {
      $('*').each((_, el) => {
        const txt = $(el).text().trim();
        if (txt && txt.length > 3 && txt.length < 80 && !studentName) {
          const children = $(el).children().length;
          if (children === 0) studentName = txt;
        }
      });
    }

    // Extract enrollments from viewGrades links
    const enrollments = [];
    $('a[href*="/students/viewGradesStudent/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/viewGradesStudent\/(\d+)/);
      if (!match) return;

      const enrollmentId = match[1];

      // Walk up to find the row context
      const $row = $(el).closest('tr');
      const cells = $row.find('td').map((_, td) => $(td).text().trim()).get();

      // Also look for sibling/nearby text
      const $parent = $(el).closest('tr, li, div.row, .enrollment-row');
      const rowText = $parent.text().replace(/\s+/g, ' ').trim();

      // Try to parse school year and semester from row
      let schoolYear = '';
      let semester = '';
      let yearLevel = '';
      let course = '';

      // Common patterns: "2025-2026", "1st Semester", "2nd Semester", "Summer"
      const yearMatch = rowText.match(/\b(20\d{2}[-–]20\d{2})\b/);
      if (yearMatch) schoolYear = yearMatch[1];

      const semMatch = rowText.match(/\b(1st|2nd|3rd|Summer)\b/i);
      if (semMatch) semester = semMatch[1];

      const yearLvlMatch = rowText.match(/\b(\d+(?:st|nd|rd|th)\s+Year)\b/i);
      if (yearLvlMatch) yearLevel = yearLvlMatch[1];

      // Extract from table cells
      if (cells.length >= 2) {
        cells.forEach(cell => {
          if (!schoolYear && /20\d{2}/.test(cell)) schoolYear = cell.match(/20\d{2}[-–]20\d{2}/)?.[0] || cell;
          if (!semester && /(1st|2nd|Summer)/i.test(cell)) semester = cell;
          if (!yearLevel && /\d+.*(year)/i.test(cell)) yearLevel = cell;
          if (!course && /BS|AB|BEEd|BEd|BSIT|BSCS|BEED|BS /i.test(cell)) course = cell;
        });
      }

      // Avoid duplicates
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

    // If no enrollments found via links, try table rows with any ID pattern
    if (enrollments.length === 0) {
      $('table tbody tr').each((_, row) => {
        const cells = $(row).find('td').map((_, td) => $(td).text().trim()).get();
        const link = $(row).find('a').attr('href') || '';
        const match = link.match(/(\d+)\/?$/);
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

// GET /api/grades/:enrollmentId
app.get('/api/grades/:enrollmentId', async (req, res) => {
  const { enrollmentId } = req.params;

  try {
    const url = `${BASE_URL}/students/viewGradesStudent/${enrollmentId}/`;
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    const grades = [];
    let gwa = '';
    let remarks = '';
    let studentInfo = {};

    // Extract student info from top of page
    $('table').first().find('tr').each((_, row) => {
      const label = $(row).find('td').first().text().trim().toLowerCase();
      const value = $(row).find('td').last().text().trim();
      if (label.includes('name')) studentInfo.name = value;
      if (label.includes('course') || label.includes('program')) studentInfo.course = value;
      if (label.includes('year')) studentInfo.yearLevel = value;
      if (label.includes('semester')) studentInfo.semester = value;
      if (label.includes('school year')) studentInfo.schoolYear = value;
    });

    // Extract grade rows
    $('table').each((_, table) => {
      $(table).find('tbody tr, tr').each((_, row) => {
        const cells = $(row).find('td').map((_, td) => $(td).text().trim()).get();

        // Skip header-like rows or empty rows
        if (cells.length < 3) return;

        // Look for rows with subject codes (usually alphanumeric like "CSIT101")
        const hasSubjectCode = /^[A-Z]{2,6}\s*\d{2,4}[A-Z]?$/i.test(cells[0]) ||
          /^[A-Z]{2,}/.test(cells[0]);

        // Detect GWA row
        const rowText = cells.join(' ').toLowerCase();
        if (rowText.includes('gwa') || rowText.includes('general weighted')) {
          const numMatch = cells.join(' ').match(/\b\d\.\d{2,4}\b/);
          if (numMatch) gwa = numMatch[0];
          const remarkMatch = cells.find(c => /passed|failed|incomplete/i.test(c));
          if (remarkMatch) remarks = remarkMatch;
          return;
        }

        if (hasSubjectCode && cells[0]) {
          grades.push({
            subjectCode: cells[0] || '',
            subjectTitle: cells[1] || '',
            units: cells[2] || '',
            midterm: cells[3] || '',
            finals: cells[4] || '',
            finalGrade: cells[5] || cells[4] || '',
            remarks: cells[6] || cells[5] || ''
          });
        }
      });
    });

    // If structured parsing failed, try a flat cell extraction
    if (grades.length === 0) {
      const allRows = [];
      $('table tr').each((_, row) => {
        const cells = $(row).find('td').map((_, td) => $(td).text().trim()).get();
        if (cells.length >= 4) allRows.push(cells);
      });

      allRows.forEach(cells => {
        const rowText = cells.join(' ').toLowerCase();
        if (rowText.includes('gwa')) {
          const numMatch = cells.join(' ').match(/\b\d\.\d{2,4}\b/);
          if (numMatch) gwa = numMatch[0];
          return;
        }
        if (/^[A-Z]/.test(cells[0]) && cells[0].length < 20) {
          grades.push({
            subjectCode: cells[0],
            subjectTitle: cells[1] || '',
            units: cells[2] || '',
            midterm: cells[3] || '',
            finals: cells[4] || '',
            finalGrade: cells[5] || '',
            remarks: cells[6] || ''
          });
        }
      });
    }

    res.json({
      enrollmentId,
      studentInfo,
      grades,
      gwa,
      remarks,
      rawAvailable: grades.length > 0
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

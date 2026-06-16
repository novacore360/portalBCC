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

// API client for JSON requests
const apiClient = axios.create({
  timeout: 20000,
  withCredentials: true,
  headers: {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Accept': 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': BASE_URL + '/',
  }
});

// Cookie jar (shared per process — good enough for a personal-use tool)
let sessionCookies = '';

async function fetchPage(url) {
  const headers = {};
  if (sessionCookies) headers['Cookie'] = sessionCookies;

  const response = await httpClient.get(url, { headers });

  const setCookie = response.headers['set-cookie'];
  if (setCookie) {
    const newCookies = setCookie
      .map(c => c.split(';')[0])
      .join('; ');
    sessionCookies = newCookies;
  }

  return response.data;
}

async function fetchAPI(url) {
  const headers = {};
  if (sessionCookies) headers['Cookie'] = sessionCookies;

  const response = await apiClient.get(url, { headers });

  const setCookie = response.headers['set-cookie'];
  if (setCookie) {
    const newCookies = setCookie
      .map(c => c.split(';')[0])
      .join('; ');
    sessionCookies = newCookies;
  }

  return response.data;
}

function isLoginPage(html) {
  const lower = html.toLowerCase();
  return (
    lower.includes('name="username"') ||
    lower.includes('name="password"') ||
    lower.includes('login') && lower.includes('<form') && !lower.includes('viewgradesstu')
  );
}

// ── Extract student name from view grades page ──────────────────────────────
function extractStudentNameFromGradesPage(html) {
  const $ = cheerio.load(html);
  
  // Try to find the student name in the Vue.js data
  // Look for: var student_pk = '12515' and then get name from API response
  
  // Method 1: Look for the name in the Vue.js created() method or data
  const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
  if (scriptMatches) {
    for (const script of scriptMatches) {
      // Look for fullname pattern in the Vue data
      const nameMatch = script.match(/fullname["']?\s*:\s*["']([^"']+)["']/);
      if (nameMatch) {
        return nameMatch[1];
      }
      // Look for student name in the API URL pattern
      const apiMatch = script.match(/\/Api\/enrollbystudsub\/\d+\/\d+\/([^'"`]+)/);
      if (apiMatch) {
        // The semester is captured, but we need the name from the page
        // Keep looking
      }
    }
  }
  
  // Method 2: Look for the name in the table data (first row)
  $('table').each((_, table) => {
    const $table = $(table);
    const headerText = $table.find('tr').first().text().trim();
    
    if (headerText.includes('Student id') && headerText.includes('Fullname')) {
      const firstRow = $table.find('tr').eq(1);
      const cells = firstRow.find('td').map((_, td) => $(td).text().trim()).get();
      if (cells.length >= 2 && cells[1]) {
        return cells[1]; // Fullname column
      }
    }
  });
  
  return '';
}

// ── Enrollment scraper ────────────────────────────────────────────────────────

app.get('/api/enrollments/:studentId', async (req, res) => {
  const { studentId } = req.params;

  try {
    const cleanStudentId = studentId.trim();
    const url = `${BASE_URL}/students/enroll/student/${encodeURIComponent(cleanStudentId)}/`;
    console.log(`📡 Fetching: ${url}`);
    
    const html = await fetchPage(url);

    if (isLoginPage(html)) {
      return res.status(401).json({ error: 'The portal returned a login page. Session may have expired.' });
    }

    const $ = cheerio.load(html);

    // ── Extract enrollments first ────────────────────────────────────────────
    const enrollments = [];
    const seenEnrollmentIds = new Set();

    $('table tbody tr, table tr').each((_, row) => {
      const $row = $(row);
      const cells = $row.find('td').map((_, td) => $(td).text().trim()).get();
      const rowText = $row.text().replace(/\s+/g, ' ').trim();
      
      const link = $row.find('a[href*="viewGradesStudent"]').attr('href') || '';
      const match = link.match(/viewGradesStudent\/(\d+)/);
      
      if (!match || cells.length < 3) return;
      
      const enrollmentId = match[1];
      if (seenEnrollmentIds.has(enrollmentId)) return;
      seenEnrollmentIds.add(enrollmentId);

      let schoolYear = '', semester = '', yearLevel = '', course = '';

      // Extract School Year
      const yearMatch = rowText.match(/\b(20\d{2}[-–]20\d{2})\b/);
      if (yearMatch) schoolYear = yearMatch[1];

      // Extract Semester
      const semMatch = rowText.match(/\b(1st|2nd|3rd|Summer)\b/i);
      if (semMatch) semester = semMatch[1];

      // Extract Year Level
      const yearLvlMatch = rowText.match(/\b(\d+(?:st|nd|rd|th)\s+Year)\b/i);
      if (yearLvlMatch) {
        yearLevel = yearLvlMatch[1];
      } else {
        const yearNumMatch = rowText.match(/\b(\d+)\s+Year\b/i);
        if (yearNumMatch) {
          const num = parseInt(yearNumMatch[1]);
          if (num >= 1 && num <= 4) {
            const suffix = ['th', 'st', 'nd', 'rd'][num] || 'th';
            yearLevel = `${num}${suffix} Year`;
          }
        }
      }

      // Extract Course
      const courseRegex = /\b(BSIT|BSCS|BEED|BSED|BSBA|BSTM|BSHM|AB|BS|BSCE|BSEE|BSCrim|BSMath|BSSW|BSBio)\b/i;
      const courseMatch = rowText.match(courseRegex);
      if (courseMatch) {
        course = courseMatch[0].toUpperCase();
      }

      if (!course) {
        for (const cell of cells) {
          const cellMatch = cell.match(courseRegex);
          if (cellMatch) {
            course = cellMatch[0].toUpperCase();
            break;
          }
        }
      }

      enrollments.push({
        enrollmentId,
        schoolYear: schoolYear || 'N/A',
        semester: semester || 'N/A',
        yearLevel: yearLevel || '',
        course: course || '',
        href: link
      });
    });

    if (enrollments.length === 0) {
      return res.status(404).json({
        error: 'No enrollment records found. Check if the student ID is correct.'
      });
    }

    // ── Get student name from the first enrollment's view grades page ──────
    let studentName = '';
    
    if (enrollments.length > 0) {
      try {
        const firstEnrollmentId = enrollments[0].enrollmentId;
        const gradesUrl = `${BASE_URL}/students/viewGradesStudent/${firstEnrollmentId}/`;
        console.log(`📡 Fetching grades page for name: ${gradesUrl}`);
        
        const gradesHtml = await fetchPage(gradesUrl);
        
        // Try to extract name from the grades page
        const $grades = cheerio.load(gradesHtml);
        
        // Method 1: Look for the name in the table
        $grades('table').each((_, table) => {
          const $table = $(table);
          const headerText = $table.find('tr').first().text().trim();
          
          if (headerText.includes('Student id') && headerText.includes('Fullname')) {
            const firstRow = $table.find('tr').eq(1);
            const cells = firstRow.find('td').map((_, td) => $(td).text().trim()).get();
            if (cells.length >= 2 && cells[1]) {
              studentName = cells[1];
              return false;
            }
          }
        });
        
        // Method 2: Look for Vue.js variables and then call the API
        if (!studentName) {
          const scriptMatches = gradesHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
          if (scriptMatches) {
            let studentPk = '', ayId = '', sem = '';
            
            for (const script of scriptMatches) {
              const pkMatch = script.match(/var\s+student_pk\s*=\s*['"]([^'"]+)['"]/);
              if (pkMatch) studentPk = pkMatch[1];
              
              const ayMatch = script.match(/var\s+ay\s*=\s*['"]([^'"]+)['"]/);
              if (ayMatch) ayId = ayMatch[1];
              
              const semMatch = script.match(/var\s+sem\s*=\s*['"]([^'"]+)['"]/);
              if (semMatch) sem = semMatch[1];
              
              if (studentPk && ayId && sem) break;
            }
            
            if (studentPk && ayId && sem) {
              const apiUrl = `${BASE_URL}/Api/enrollbystudsub/${studentPk}/${ayId}/${sem}`;
              try {
                const data = await fetchAPI(apiUrl);
                if (data && data.length > 0) {
                  const name = data[0]?.enrolled_by_student?.student?.last_name 
                    ? `${data[0].enrolled_by_student.student.last_name}, ${data[0].enrolled_by_student.student.first_name}`
                    : '';
                  if (name) studentName = name;
                }
              } catch (apiError) {
                console.error('API fetch for name error:', apiError.message);
              }
            }
          }
        }
        
        // Method 3: Look for name in h1/h2 tags
        if (!studentName) {
          const nameCandidates = [
            $grades('h1').first().text().trim(),
            $grades('h2').first().text().trim(),
            $grades('h3').first().text().trim(),
            $grades('.student-name').first().text().trim(),
            $grades('[class*="name"]').first().text().trim(),
          ];
          
          for (const candidate of nameCandidates) {
            if (candidate && candidate.length > 3 && candidate.length < 100 &&
                !/dashboard|portal|enrollment|subject|grade/i.test(candidate)) {
              studentName = candidate;
              break;
            }
          }
        }
        
        console.log(`✅ Extracted student name: "${studentName}"`);
        
      } catch (error) {
        console.error('Error fetching student name from grades page:', error.message);
      }
    }

    // ── Fallback: try to get name from the enrollment page ─────────────────
    if (!studentName) {
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

      if (!studentName) {
        $('p, span, div, td, li').each((_, el) => {
          if (studentName) return;
          const el$ = $(el);
          if (el$.children().length > 0) return;
          const txt = el$.text().trim();
          if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}$/.test(txt)) {
            studentName = txt;
          }
          if (!studentName && /^[A-Z]+,\s+[A-Z]+/.test(txt) && txt.length < 60) {
            studentName = txt;
          }
        });
      }
    }

    res.json({ 
      studentId: cleanStudentId, 
      studentName: studentName || 'Student', 
      enrollments 
    });

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
    const pageUrl = `${BASE_URL}/students/viewGradesStudent/${enrollmentId}/`;
    const html = await fetchPage(pageUrl);

    if (isLoginPage(html)) {
      return res.status(401).json({
        error: 'The portal requires a login session to view grade details.'
      });
    }

    let studentPk = '';
    let ayId = '';
    let sem = '';

    const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
    if (scriptMatches) {
      for (const script of scriptMatches) {
        const pkMatch = script.match(/var\s+student_pk\s*=\s*['"]([^'"]+)['"]/);
        if (pkMatch) studentPk = pkMatch[1];
        
        const ayMatch = script.match(/var\s+ay\s*=\s*['"]([^'"]+)['"]/);
        if (ayMatch) ayId = ayMatch[1];
        
        const semMatch = script.match(/var\s+sem\s*=\s*['"]([^'"]+)['"]/);
        if (semMatch) sem = semMatch[1];
        
        if (studentPk && ayId && sem) break;
      }
    }

    if (!studentPk || !ayId || !sem) {
      const vueCreatedMatch = html.match(/axios\.get\([`'"]\/Api\/enrollbystudsub\/(\d+)\/(\d+)\/([^'"`]+)[`'"]/);
      if (vueCreatedMatch) {
        studentPk = vueCreatedMatch[1];
        ayId = vueCreatedMatch[2];
        sem = vueCreatedMatch[3];
      }
    }

    if (studentPk && ayId && sem) {
      console.log(`📡 Calling API: student_pk=${studentPk}, ay=${ayId}, sem=${sem}`);
      
      const apiUrl = `${BASE_URL}/Api/enrollbystudsub/${studentPk}/${ayId}/${sem}`;
      
      try {
        const data = await fetchAPI(apiUrl);
        
        if (data && data.length > 0) {
          const grades = data.map(el => ({
            subjectCode: el.subject?.code || '',
            subjectTitle: el.subject?.description || '',
            units: el.subject?.unit?.toString() || '',
            midterm: el.midterm_grade?.toString() || '',
            finalGrade: el.grade?.toString() || '',
            remarks: el.grade_status || 'N/A',
            status: el.grade_status || 'N/A'
          }));

          let totalUnits = 0;
          let totalGradePoints = 0;

          grades.forEach(g => {
            const grade = parseFloat(g.finalGrade);
            const units = parseFloat(g.units) || 0;
            if (grade > 0 && units > 0 && g.remarks?.toLowerCase() === 'passed') {
              totalUnits += units;
              totalGradePoints += grade * units;
            }
          });

          const gwa = totalUnits > 0 ? (totalGradePoints / totalUnits).toFixed(2) : 'N/A';
          const remarks = totalUnits > 0 ? 'Passed' : 'No grades available';

          const studentInfo = {
            name: data[0]?.enrolled_by_student?.student?.last_name 
              ? `${data[0].enrolled_by_student.student.last_name}, ${data[0].enrolled_by_student.student.first_name}`
              : '',
            course: data[0]?.enrolled_by_student?.course?.code || '',
            yearLevel: data[0]?.enrolled_by_student?.year_level?.description || '',
            studentId: data[0]?.enrolled_by_student?.student?.student_id || '',
          };

          return res.json({
            enrollmentId,
            studentInfo,
            grades,
            gwa,
            remarks,
            source: 'api'
          });
        }
      } catch (apiError) {
        console.error('API fetch error:', apiError.message);
      }
    }

    console.log('⚠️ API method failed, falling back to static HTML parsing...');
    
    const $ = cheerio.load(html);
    const grades = [];
    let studentInfo = {};

    $('table').each((_, table) => {
      const $table = $(table);
      const headerText = $table.find('tr').first().text().trim();
      
      if (headerText.includes('Student id') && headerText.includes('Fullname')) {
        $table.find('tr').each((_, row) => {
          const cells = $(row).find('td').map((_, td) => $(td).text().trim()).get();
          
          if (cells[0] === 'Student id' || cells[0] === 'Fullname') return;
          if (cells.length < 4) return;
          
          if (cells[2] && /^[A-Z]{2,}[\s\-]?\d/.test(cells[2])) {
            grades.push({
              studentId: cells[0] || '',
              studentName: cells[1] || '',
              subjectCode: cells[2] || '',
              subjectTitle: cells[3] || '',
              midterm: cells[4] || '',
              finalGrade: cells[5] || '',
              units: cells[6] || '',
              remarks: cells[7] || '',
              status: cells[7] || ''
            });
            
            if (grades.length === 1) {
              studentInfo = {
                name: cells[1] || '',
                studentId: cells[0] || '',
                course: '',
                yearLevel: ''
              };
            }
          }
        });
        return false;
      }
    });

    if (grades.length === 0) {
      return res.status(404).json({
        error: 'No grades found. The portal may have changed its structure.'
      });
    }

    let totalUnits = 0;
    let totalGradePoints = 0;

    grades.forEach(g => {
      const grade = parseFloat(g.finalGrade);
      const units = parseFloat(g.units) || 0;
      if (grade > 0 && units > 0 && g.remarks?.toLowerCase() === 'passed') {
        totalUnits += units;
        totalGradePoints += grade * units;
      }
    });

    const gwa = totalUnits > 0 ? (totalGradePoints / totalUnits).toFixed(2) : 'N/A';
    const remarks = totalUnits > 0 ? 'Passed' : 'No grades available';

    res.json({
      enrollmentId,
      studentInfo,
      grades,
      gwa,
      remarks,
      source: 'static_html'
    });

  } catch (err) {
    console.error('Grades fetch error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
    res.status(500).json({ 
      error: 'Could not fetch grades. Try again later.',
      details: err.message 
    });
  }
});

// Catch-all: serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BCC Portal server running on port ${PORT}`);
});

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;
const BASE_URL = 'https://portal.buenavistacommunitycollege.edu.ph';

app.use(cors());
app.use(express.json());

// ── SMTP Email Configuration ────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'bitfi.ventures@gmail.com',
    pass: 'tixs xirf bset shel'
  }
});

// ── Generate HTML grade report ──────────────────────────────────────────────
function generateGradeHTML(data) {
  const { studentName, course, schoolYear, semester, grades, gwa, remarks, enrollment } = data;
  
  let gradeRows = '';
  if (grades && grades.length > 0) {
    grades.forEach(g => {
      gradeRows += `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; font-size: 13px;">${g.subjectCode || ''}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; font-size: 13px;">${g.subjectTitle || ''}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; font-size: 13px; text-align: center;">${g.units || ''}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; font-size: 13px; text-align: center;">${g.midterm || ''}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; font-size: 13px; text-align: center;">${g.finalGrade || ''}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; font-size: 13px; text-align: center;">${g.remarks || ''}</td>
        </tr>
      `;
    });
  } else {
    gradeRows = '<tr><td colspan="6" style="padding: 16px; text-align: center; color: #8a8a8a;">No grade data available.</td></tr>';
  }

  const isPassed = remarks && remarks.toLowerCase().includes('pass');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BCC Grade Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8f6f0; margin: 0; padding: 40px 20px; color: #1a1a1a; }
    .container { max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: #0A2414; padding: 30px 40px; border-bottom: 4px solid #C9A84C; }
    .header h1 { color: #C9A84C; font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -0.5px; }
    .header p { color: #B8C9A8; font-size: 14px; margin: 6px 0 0 0; }
    .body { padding: 30px 40px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; background: #f5f2eb; padding: 16px 20px; border-radius: 8px; margin-bottom: 24px; }
    .info-grid .label { font-size: 11px; font-weight: 700; color: #8a7a5a; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-grid .value { font-size: 15px; font-weight: 500; color: #1a1a1a; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    table thead th { background: #0A2414; color: #C9A84C; padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    table tbody tr:hover { background: #f5f2eb; }
    .gwa-section { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; background: #f5f2eb; border-radius: 8px; margin-top: 20px; }
    .gwa-section .gwa-label { font-size: 13px; font-weight: 600; color: #8a7a5a; text-transform: uppercase; letter-spacing: 0.5px; }
    .gwa-section .gwa-value { font-size: 28px; font-weight: 700; color: ${isPassed ? '#2d7d3a' : '#b33a3a'}; }
    .gwa-section .gwa-remark { font-size: 12px; font-weight: 700; padding: 4px 14px; border-radius: 20px; background: ${isPassed ? '#e6f4e6' : '#fce8e8'}; color: ${isPassed ? '#2d7d3a' : '#b33a3a'}; text-transform: uppercase; letter-spacing: 0.5px; }
    .footer { padding: 20px 40px; background: #f5f2eb; font-size: 11px; color: #8a8a8a; text-align: center; border-top: 1px solid #e5e5e5; line-height: 1.6; }
    .footer strong { color: #0A2414; }
    @media (max-width: 600px) {
      .body { padding: 20px; }
      .header { padding: 20px; }
      .info-grid { grid-template-columns: 1fr; gap: 6px; }
      .gwa-section { flex-direction: column; gap: 8px; text-align: center; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>BCC Portal Grade Report</h1>
      <p>Buenavista Community College</p>
    </div>
    <div class="body">
      <div class="info-grid">
        <div><div class="label">Student Name</div><div class="value">${studentName || 'N/A'}</div></div>
        <div><div class="label">Course</div><div class="value">${course || 'N/A'}</div></div>
        <div><div class="label">School Year</div><div class="value">${schoolYear || 'N/A'}</div></div>
        <div><div class="label">Semester</div><div class="value">${semester || 'N/A'}</div></div>
        <div><div class="label">Enrollment ID</div><div class="value">${enrollment?.enrollmentId || 'N/A'}</div></div>
      </div>

      <h3 style="font-size: 15px; font-weight: 600; margin: 0 0 10px 0; color: #0A2414;">Grade Summary</h3>
      <table>
        <thead>
          <tr>
            <th>Subject Code</th>
            <th>Subject Title</th>
            <th style="text-align: center;">Units</th>
            <th style="text-align: center;">Midterm</th>
            <th style="text-align: center;">Final</th>
            <th style="text-align: center;">Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${gradeRows}
        </tbody>
      </table>

      <div class="gwa-section">
        <span class="gwa-label">General Weighted Average</span>
        <span class="gwa-value">${gwa || 'N/A'}</span>
        <span class="gwa-remark">${remarks || 'N/A'}</span>
      </div>
    </div>
    <div class="footer">
      <p>
        <strong>BCC Portal</strong> &bull; This report was generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}<br>
        <span style="color: #aaa;">This system is used and created for students who forgot their login credentials. All data is requested from the main BCC portal using GET requests.</span>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function formatStudentName(name) {
  if (!name) return '';
  if (name.includes(',')) {
    const parts = name.split(',');
    if (parts.length === 2) {
      const lastName = parts[0].trim();
      const firstName = parts[1].trim();
      return `${firstName} ${lastName}`;
    }
  }
  return name;
}

// ── Send Grade Copy Endpoint ──────────────────────────────────────────────

app.post('/api/send-grade-copy', async (req, res) => {
  const { email, enrollmentId, studentName, course, schoolYear, semester, grades, gwa, remarks, studentInfo, enrollment } = req.body;

  if (!email || !enrollmentId) {
    return res.status(400).json({ error: 'Email and enrollment ID are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  try {
    const nameParts = [];
    const formattedName = formatStudentName(studentName);
    if (formattedName) nameParts.push(formattedName);
    if (course) nameParts.push(course);
    if (schoolYear && schoolYear !== 'N/A') nameParts.push(schoolYear);
    if (semester) nameParts.push(semester);
    
    const fileName = nameParts.length > 0 
      ? `BCC_Grades_${nameParts.join('_').replace(/\s+/g, '_')}`
      : `BCC_Grades_${enrollmentId}`;

    const htmlContent = generateGradeHTML({
      studentName: studentName || 'Student',
      course: course || studentInfo?.course || '',
      schoolYear: schoolYear || '',
      semester: semester || '',
      grades: grades || [],
      gwa: gwa || 'N/A',
      remarks: remarks || 'N/A',
      enrollment: enrollment || { enrollmentId }
    });

    const mailOptions = {
      from: '"BCC Portal" <bitfi.ventures@gmail.com>',
      to: email,
      subject: 'BCC Portal - Grade Report Request',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a; background: #f8f6f0; border-radius: 12px;">
          <div style="background: #0A2414; padding: 20px 24px; border-radius: 12px 12px 0 0; border-bottom: 3px solid #C9A84C;">
            <h1 style="color: #C9A84C; font-size: 20px; margin: 0; font-weight: 700;">BCC Portal</h1>
            <p style="color: #B8C9A8; margin: 4px 0 0 0; font-size: 14px;">Buenavista Community College</p>
          </div>
          <div style="background: #ffffff; padding: 24px; border-radius: 0 0 12px 12px;">
            <p style="font-size: 15px; margin: 0 0 6px 0;">Dear Student,</p>
            <p style="font-size: 14px; color: #444; margin: 0 0 16px 0; line-height: 1.6;">
              You requested a copy of your grades from the BCC Portal. Please find the attached HTML file containing your grade report.
            </p>
            <div style="background: #f5f2eb; padding: 14px 18px; border-radius: 8px; margin-bottom: 16px;">
              <p style="margin: 0; font-size: 13px; color: #555;">
                <strong>Student:</strong> ${studentName || 'N/A'}<br>
                <strong>Enrollment ID:</strong> ${enrollmentId}<br>
                <strong>GWA:</strong> ${gwa || 'N/A'} &bull; <strong>Status:</strong> ${remarks || 'N/A'}
              </p>
            </div>
            <p style="font-size: 13px; color: #777; margin: 0 0 4px 0; line-height: 1.5;">
              If you have any questions, please contact the BCC Registrar's Office.
            </p>
            <p style="font-size: 13px; color: #777; margin: 0; line-height: 1.5;">
              Best regards,<br>
              <strong style="color: #0A2414;">BCC Portal Team</strong>
            </p>
            <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 18px 0 12px 0;">
            <p style="font-size: 11px; color: #999; margin: 0; line-height: 1.5; text-align: center;">
              This system is used and created for students who forgot their login credentials. 
              All data is requested from the main BCC portal using GET requests.
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `${fileName}.html`,
          content: htmlContent,
          contentType: 'text/html'
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    
    res.json({ 
      success: true, 
      message: 'Grade copy sent successfully!',
      fileName: `${fileName}.html`
    });

  } catch (error) {
    console.error('Email send error:', error.message);
    res.status(500).json({ 
      error: 'Failed to send email. Please try again later.' 
    });
  }
});

// ── Serve React build ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../client/build')));

// ── Shared axios instance ──────────────────────────────────────────────────
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

      const yearMatch = rowText.match(/\b(20\d{2}[-–]20\d{2})\b/);
      if (yearMatch) schoolYear = yearMatch[1];

      const semMatch = rowText.match(/\b(1st|2nd|3rd|Summer)\b/i);
      if (semMatch) semester = semMatch[1];

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

    let studentName = '';
    if (enrollments.length > 0) {
      try {
        const firstEnrollmentId = enrollments[0].enrollmentId;
        const gradesUrl = `${BASE_URL}/students/viewGradesStudent/${firstEnrollmentId}/`;
        console.log(`📡 Fetching grades page for name: ${gradesUrl}`);
        
        const gradesHtml = await fetchPage(gradesUrl);
        const $grades = cheerio.load(gradesHtml);
        
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

// ── Catch-all: serve React app ────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BCC Portal server running on port ${PORT}`);
});

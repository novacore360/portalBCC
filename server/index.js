require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');

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

// ── Request Copy (email) helpers ─────────────────────────────────────────────

// SMTP transporter — credentials come from .env (see server/.env.example)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE !== 'false',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugifyFilename(str) {
  const slug = String(str)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return slug || 'Student_Grades';
}

// Builds the .xlsx workbook buffer for a grades request
async function buildGradesWorkbookBuffer(heading, enrollmentId, gradesData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BCC Portal';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Grades', {
    pageSetup: { fitToPage: true, orientation: 'landscape' },
    views: [{ showGridLines: false }],
  });

  const columns = [
    { header: 'Subject Code', width: 16 },
    { header: 'Subject Title', width: 38 },
    { header: 'Units', width: 10 },
    { header: 'Midterm', width: 12 },
    { header: 'Final Grade', width: 14 },
    { header: 'Remarks', width: 14 },
  ];
  const colCount = columns.length;
  columns.forEach((col, i) => { sheet.getColumn(i + 1).width = col.width; });

  // Title (heading from View Grades)
  sheet.mergeCells(1, 1, 1, colCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = heading;
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0A2414' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 24;

  // Subtitle (enrollment id + generated date)
  sheet.mergeCells(2, 1, 2, colCount);
  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = `Enrollment ID: ${enrollmentId}   |   Generated: ${new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`;
  subtitleCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF666666' } };
  subtitleCell.alignment = { horizontal: 'center' };
  sheet.getRow(2).height = 18;

  // Header row
  const headerRowNum = 4;
  columns.forEach((col, i) => {
    const cell = sheet.getCell(headerRowNum, i + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2414' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFC9A84C' } } };
  });
  sheet.getRow(headerRowNum).height = 20;

  // Data rows
  let rowNum = headerRowNum + 1;
  (gradesData.grades || []).forEach((g) => {
    const row = sheet.getRow(rowNum);
    row.getCell(1).value = g.subjectCode || '';
    row.getCell(2).value = g.subjectTitle || '';
    row.getCell(3).value = g.units && !isNaN(parseFloat(g.units)) ? parseFloat(g.units) : (g.units || '');
    row.getCell(4).value = g.midterm || '';
    row.getCell(5).value = g.finalGrade || '';
    row.getCell(6).value = g.remarks || '';
    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10.5 };
      cell.alignment = { vertical: 'middle', horizontal: colNum === 2 ? 'left' : 'center' };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE0E0E0' } } };
      if (rowNum % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F5EE' } };
      }
    });
    rowNum += 1;
  });

  // GWA summary
  if (gradesData.gwa) {
    rowNum += 1;
    sheet.mergeCells(rowNum, 1, rowNum, colCount - 2);
    const gwaLabelCell = sheet.getCell(rowNum, 1);
    gwaLabelCell.value = 'General Weighted Average';
    gwaLabelCell.font = { name: 'Calibri', size: 11, bold: true };
    gwaLabelCell.alignment = { horizontal: 'right' };

    sheet.mergeCells(rowNum, colCount - 1, rowNum, colCount);
    const gwaValueCell = sheet.getCell(rowNum, colCount - 1);
    gwaValueCell.value = gradesData.remarks ? `${gradesData.gwa}  (${gradesData.remarks})` : `${gradesData.gwa}`;
    gwaValueCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0A2414' } };
    gwaValueCell.alignment = { horizontal: 'center' };
  }

  // Disclaimer
  rowNum += 2;
  sheet.mergeCells(rowNum, 1, rowNum, colCount);
  const disclaimerCell = sheet.getCell(rowNum, 1);
  disclaimerCell.value =
    'This document was generated by BCC Portal, a tool created to assist students who have lost access to their official portal login credentials. ' +
    'All figures above were retrieved directly from the official Buenavista Community College portal using public GET requests at the time of this ' +
    'request, and are provided for the personal reference of the named student only. This is not an official transcript or certified document.';
  disclaimerCell.font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF888888' } };
  disclaimerCell.alignment = { wrapText: true, vertical: 'top' };
  sheet.getRow(rowNum).height = 42;

  return workbook.xlsx.writeBuffer();
}

// Builds the HTML email body sent alongside the attachment
function buildRequestCopyEmailHtml({ heading, enrollmentId, gwa, remarks }) {
  const summaryRow = gwa
    ? `<tr>
         <td style="padding:8px 0;border-bottom:1px solid #eeeeee;color:#777777;font-size:13px;">General Weighted Average</td>
         <td style="padding:8px 0;border-bottom:1px solid #eeeeee;color:#1a1a1a;font-size:13px;font-weight:bold;text-align:right;">${escapeHtml(gwa)}${remarks ? ' (' + escapeHtml(remarks) + ')' : ''}</td>
       </tr>`
    : '';

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e2e2;">
            <tr>
              <td style="background-color:#0A2414;padding:24px 32px;">
                <span style="color:#E2C36A;font-size:20px;font-weight:bold;letter-spacing:0.5px;">BCC Portal</span>
                <div style="color:#cfd8c8;font-size:12px;margin-top:4px;">Buenavista Community College</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:18px;">Requested Copy of Grades</h2>
                <p style="margin:0 0 20px;color:#444444;font-size:14px;line-height:1.6;">
                  Please find attached the requested copy of grade records in spreadsheet (.xlsx) format, as requested through BCC Portal.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #eeeeee;color:#777777;font-size:13px;">Record</td>
                    <td style="padding:8px 0;border-bottom:1px solid #eeeeee;color:#1a1a1a;font-size:13px;font-weight:bold;text-align:right;">${escapeHtml(heading)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #eeeeee;color:#777777;font-size:13px;">Enrollment ID</td>
                    <td style="padding:8px 0;border-bottom:1px solid #eeeeee;color:#1a1a1a;font-size:13px;text-align:right;">${escapeHtml(String(enrollmentId))}</td>
                  </tr>
                  ${summaryRow}
                </table>
                <p style="margin:0;color:#444444;font-size:13px;line-height:1.6;">
                  The attached file contains the full subject list with midterm and final grades for this enrollment period.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #eeeeee;">
                <p style="margin:0;color:#888888;font-size:11px;line-height:1.6;">
                  Disclaimer: BCC Portal is an unofficial tool created to assist students who have forgotten their login credentials for the official
                  Buenavista Community College portal. All data included in this email and its attachment was retrieved directly from the official
                  BCC portal using public GET requests, without modification, at the time this request was made. This document is intended solely
                  for the personal reference of the named student and should not be treated as an official transcript or certified document. For
                  official records, please contact the BCC Registrar's Office directly.
                </p>
              </td>
            </tr>
          </table>
          <p style="color:#aaaaaa;font-size:11px;margin-top:16px;">This is an automated message from BCC Portal. Please do not reply to this email.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
// Shared by GET /api/grades/:enrollmentId and POST /api/request-copy so both
// always pull the same live data straight from the portal via GET requests.

async function getGradesData(enrollmentId) {
    const pageUrl = `${BASE_URL}/students/viewGradesStudent/${enrollmentId}/`;
    const html = await fetchPage(pageUrl);

    if (isLoginPage(html)) {
      const err = new Error('The portal requires a login session to view grade details.');
      err.status = 401;
      throw err;
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

          return {
            enrollmentId,
            studentInfo,
            grades,
            gwa,
            remarks,
            source: 'api'
          };
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
      const err = new Error('No grades found. The portal may have changed its structure.');
      err.status = 404;
      throw err;
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

    return {
      enrollmentId,
      studentInfo,
      grades,
      gwa,
      remarks,
      source: 'static_html'
    };
}

app.get('/api/grades/:enrollmentId', async (req, res) => {
  const { enrollmentId } = req.params;

  try {
    const result = await getGradesData(enrollmentId);
    res.json(result);
  } catch (err) {
    console.error('Grades fetch error:', err.message);
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
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

// ── Request Copy ──────────────────────────────────────────────────────────────
// Re-fetches the grade data live from the portal (same as above) for the given
// enrollment ID, builds an .xlsx workbook, and emails it to the requested address.

app.post('/api/request-copy', async (req, res) => {
  const { enrollmentId, email, heading } = req.body || {};

  if (!enrollmentId || !/^\d+$/.test(String(enrollmentId))) {
    return res.status(400).json({ error: 'A valid enrollment ID is required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('SMTP credentials are not configured. Set SMTP_USER and SMTP_PASS in .env');
    return res.status(500).json({ error: 'Email sending is not configured on the server.' });
  }

  try {
    const gradesData = await getGradesData(enrollmentId);

    if (!gradesData.grades || gradesData.grades.length === 0) {
      return res.status(404).json({ error: 'No grade records were found to send for this enrollment.' });
    }

    const safeHeading = (heading && String(heading).trim().slice(0, 150)) || 'BCC Student Grades';
    const fileName = `${slugifyFilename(safeHeading)}_Grades.xlsx`;

    const buffer = await buildGradesWorkbookBuffer(safeHeading, enrollmentId, gradesData);

    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'BCC Portal'}" <${process.env.SMTP_USER}>`,
      to: email.trim(),
      subject: 'Request Copy',
      html: buildRequestCopyEmailHtml({
        heading: safeHeading,
        enrollmentId,
        gwa: gradesData.gwa,
        remarks: gradesData.remarks,
      }),
      attachments: [
        {
          filename: fileName,
          content: buffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    });

    res.json({ success: true, message: `Grades sent to ${email.trim()}.` });
  } catch (err) {
    console.error('Request copy error:', err.message);
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    res.status(500).json({ error: 'Could not send the requested copy. Please try again later.' });
  }
});

// Catch-all: serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BCC Portal server running on port ${PORT}`);
});

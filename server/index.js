require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const cors    = require('cors');
const path    = require('path');
const nodemailer = require('nodemailer');
const ExcelJS    = require('exceljs');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ── Serve React build in production ──────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// ── SMTP Transporter ──────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const BASE = 'https://portal.buenavistacommunitycollege.edu.ph';

function semesterLabel(sem) {
  if (!sem || sem === 'N/A') return '';
  const s = sem.toLowerCase();
  if (s.includes('1st') || s === '1') return '1st Semester';
  if (s.includes('2nd') || s === '2') return '2nd Semester';
  if (s.includes('summer'))           return 'Summer';
  return sem;
}

function formatStudentName(name) {
  if (!name) return '';
  if (name.includes(',')) {
    const [last, first] = name.split(',');
    return `${first.trim()} ${last.trim()}`;
  }
  return name;
}

// ── API: enrollments ──────────────────────────────────────────────────────────
app.get('/api/enrollments/:studentId', async (req, res) => {
  try {
    const url  = `${BASE}/students/enroll/student/${req.params.studentId}/`;
    const { data: html } = await axios.get(url, { timeout: 15000 });
    const $    = cheerio.load(html);
    const enrollments = [];
    let studentName = '';
    let course = '';
    let yearLevel = '';

    // Try to grab student name / course from the page
    $('h4, h3, .student-name').each((_, el) => {
      const t = $(el).text().trim();
      if (t) studentName = studentName || t;
    });

    $('a[href*="viewGradesStudent"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/viewGradesStudent\/(\d+)\//);
      if (!match) return;
      const enrollmentId = match[1];
      const row = $(el).closest('tr');
      const cells = row.find('td');

      enrollments.push({
        enrollmentId,
        schoolYear: cells.eq(1).text().trim() || 'N/A',
        semester:   cells.eq(2).text().trim() || 'N/A',
        course:     cells.eq(3).text().trim() || course,
        yearLevel:  cells.eq(4).text().trim() || yearLevel,
      });
    });

    if (!enrollments.length) {
      return res.status(404).json({ error: 'No enrollment records found for that student ID.' });
    }

    res.json({ studentId: req.params.studentId, studentName, enrollments });
  } catch (err) {
    console.error('Enrollments error:', err.message);
    res.status(500).json({ error: 'Failed to fetch enrollment records. Check the student ID and try again.' });
  }
});

// ── API: grades ───────────────────────────────────────────────────────────────
app.get('/api/grades/:enrollmentId', async (req, res) => {
  try {
    const url  = `${BASE}/students/enroll/viewGradesStudent/${req.params.enrollmentId}/`;
    const { data: html } = await axios.get(url, { timeout: 15000 });
    const $ = cheerio.load(html);
    const grades = [];
    let gwa = '';
    let remarks = '';
    const studentInfo = {};

    // Student info
    $('td, th').each((_, el) => {
      const label = $(el).text().trim().toLowerCase();
      if (label.includes('student') && label.includes('name')) {
        studentInfo.name = $(el).next('td').text().trim();
      }
      if (label.includes('course')) {
        studentInfo.course = $(el).next('td').text().trim();
      }
    });

    // Grade rows
    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 3) return;
      const subjectCode = cells.eq(0).text().trim();
      if (!subjectCode || subjectCode.toLowerCase() === 'subject code') return;

      // GWA row detection
      const label = cells.eq(0).text().trim().toLowerCase();
      if (label.includes('gwa') || label.includes('general weighted')) {
        gwa     = cells.eq(1).text().trim() || cells.eq(cells.length - 2).text().trim();
        remarks = cells.eq(cells.length - 1).text().trim();
        return;
      }

      grades.push({
        subjectCode,
        subjectTitle: cells.eq(1).text().trim(),
        units:        cells.eq(2).text().trim(),
        midterm:      cells.eq(3).text().trim(),
        finals:       cells.eq(4).text().trim(),
        finalGrade:   cells.eq(5).text().trim(),
        remarks:      cells.eq(6).text().trim(),
      });
    });

    res.json({ enrollmentId: req.params.enrollmentId, studentInfo, grades, gwa, remarks });
  } catch (err) {
    console.error('Grades error:', err.message);
    res.status(500).json({ error: 'Failed to fetch grade details.' });
  }
});

// ── API: send grades copy via email ───────────────────────────────────────────
app.post('/api/send-grades', async (req, res) => {
  const { email, studentName, studentId, enrollmentId, schoolYear, semester, course, yearLevel, gwa, remarks, grades, title } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!grades || !grades.length) {
    return res.status(400).json({ error: 'No grade data to send.' });
  }

  try {
    // ── Build XLS attachment ──────────────────────────────────────────────────
    const workbook  = new ExcelJS.Workbook();
    workbook.creator = 'BCC Portal';
    workbook.created  = new Date();

    const sheet = workbook.addWorksheet('Grade Report');

    // Header branding
    sheet.mergeCells('A1:G1');
    sheet.getCell('A1').value = 'BUENAVISTA COMMUNITY COLLEGE';
    sheet.getCell('A1').font  = { bold: true, size: 14, color: { argb: 'FF0A2414' } };
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC9A84C' } };

    sheet.mergeCells('A2:G2');
    sheet.getCell('A2').value = 'Official Grade Report (Copy)';
    sheet.getCell('A2').font  = { bold: true, size: 11, color: { argb: 'FF0A2414' } };
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2C36A' } };

    sheet.addRow([]);

    // Student details
    const detailStyle = { font: { size: 11 } };

    const addInfo = (label, value) => {
      const row = sheet.addRow([label, value]);
      row.getCell(1).font = { bold: true, size: 11 };
      row.getCell(2).font = { size: 11 };
    };

    addInfo('Student Name:', formatStudentName(studentName) || studentName || 'N/A');
    addInfo('Student ID:',   studentId   || 'N/A');
    addInfo('Course:',       course      || 'N/A');
    addInfo('Year Level:',   yearLevel   || 'N/A');
    addInfo('School Year:',  schoolYear  || 'N/A');
    addInfo('Semester:',     semesterLabel(semester) || semester || 'N/A');
    addInfo('Enrollment ID:', enrollmentId || 'N/A');
    addInfo('Date Generated:', new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }));

    sheet.addRow([]);

    // Column headers
    const headerRow = sheet.addRow(['Subject Code', 'Subject Title', 'Units', 'Midterm', 'Finals', 'Final Grade', 'Remarks']);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2414' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
    });

    // Grade rows
    grades.forEach((g, idx) => {
      const row = sheet.addRow([
        g.subjectCode  || '',
        g.subjectTitle || '',
        g.units        || '',
        g.midterm      || '',
        g.finals       || '',
        g.finalGrade   || '',
        g.remarks      || '',
      ]);
      const bg = idx % 2 === 0 ? 'FFFAFAF7' : 'FFF5EDD8';
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD0C090' } },
          bottom: { style: 'thin', color: { argb: 'FFD0C090' } },
          left: { style: 'thin', color: { argb: 'FFD0C090' } },
          right: { style: 'thin', color: { argb: 'FFD0C090' } },
        };
        cell.font = { size: 11 };
      });
    });

    // GWA row
    if (gwa) {
      sheet.addRow([]);
      const gwaRow = sheet.addRow(['', '', '', '', '', 'GWA:', gwa]);
      gwaRow.getCell(6).font = { bold: true, size: 12 };
      gwaRow.getCell(7).font = { bold: true, size: 12 };
      if (remarks) {
        const remRow = sheet.addRow(['', '', '', '', '', 'Remarks:', remarks]);
        remRow.getCell(6).font = { bold: true, size: 11 };
        remRow.getCell(7).font = { size: 11 };
      }
    }

    // Disclaimer
    sheet.addRow([]);
    sheet.addRow([]);
    const disc1 = sheet.addRow(['DISCLAIMER:']);
    disc1.getCell(1).font = { bold: true, size: 10, italic: true, color: { argb: 'FF666666' } };

    const discText = 'This system (BCC Portal) is an unofficial tool created and maintained for students who have forgotten their login credentials to the official Buenavista Community College portal. All data presented in this document is retrieved directly from the official BCC portal (portal.buenavistacommunitycollege.edu.ph) via HTTP GET requests and is not stored, modified, or retained by this system. This document is intended solely for the personal reference of the requesting student. For official records and certified copies, please contact the BCC Registrar\'s Office.';
    sheet.mergeCells(`A${sheet.lastRow.number + 1}:G${sheet.lastRow.number + 1}`);
    const discRow = sheet.addRow([discText]);
    discRow.getCell(1).font = { size: 9, italic: true, color: { argb: 'FF888888' } };
    discRow.getCell(1).alignment = { wrapText: true };
    discRow.height = 60;

    // Column widths
    sheet.getColumn(1).width = 18;
    sheet.getColumn(2).width = 36;
    sheet.getColumn(3).width = 8;
    sheet.getColumn(4).width = 10;
    sheet.getColumn(5).width = 10;
    sheet.getColumn(6).width = 13;
    sheet.getColumn(7).width = 12;

    const xlsBuffer = await workbook.xlsx.writeBuffer();

    // ── Build HTML email body ─────────────────────────────────────────────────
    const displayName = formatStudentName(studentName) || studentName || 'Student';
    const semLabel    = semesterLabel(semester) || semester || '';
    const reportTitle = title || [schoolYear, semLabel].filter(Boolean).join(' | ') || 'Grade Report';
    const dateGen     = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

    const gradeRows = grades.map((g, i) => `
      <tr style="background:${i % 2 === 0 ? '#fafaf7' : '#f5edd8'};">
        <td style="padding:9px 12px;border:1px solid #d4c08a;font-weight:600;color:#0a2414;">${g.subjectCode || ''}</td>
        <td style="padding:9px 12px;border:1px solid #d4c08a;color:#1a1a1a;">${g.subjectTitle || ''}</td>
        <td style="padding:9px 12px;border:1px solid #d4c08a;text-align:center;color:#1a1a1a;">${g.units || ''}</td>
        <td style="padding:9px 12px;border:1px solid #d4c08a;text-align:center;color:#1a1a1a;">${g.midterm || ''}</td>
        <td style="padding:9px 12px;border:1px solid #d4c08a;text-align:center;color:#1a1a1a;">${g.finals || ''}</td>
        <td style="padding:9px 12px;border:1px solid #d4c08a;text-align:center;font-weight:700;color:#0a2414;">${g.finalGrade || ''}</td>
        <td style="padding:9px 12px;border:1px solid #d4c08a;text-align:center;color:${(g.remarks||'').toLowerCase().includes('pass') ? '#1a7a3a' : (g.remarks||'').toLowerCase().includes('fail') ? '#c0392b' : '#555'};">${g.remarks || ''}</td>
      </tr>
    `).join('');

    const htmlEmail = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BCC Grade Report</title>
</head>
<body style="margin:0;padding:0;background:#f0ede6;font-family:Arial,Helvetica,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.10);">

          <!-- Header -->
          <tr>
            <td style="background:#0a2414;padding:28px 36px 22px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size:11px;font-weight:700;color:#c9a84c;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">Buenavista Community College</div>
                    <div style="font-size:22px;font-weight:700;color:#f5edd8;letter-spacing:-0.3px;line-height:1.2;">Official Grade Report</div>
                    <div style="font-size:13px;color:#8aaf7e;margin-top:6px;">${reportTitle}</div>
                  </td>
                  <td align="right" valign="top">
                    <div style="font-size:11px;color:#6e8c5e;text-align:right;">
                      <div>Date Generated</div>
                      <div style="color:#c9a84c;font-weight:600;margin-top:3px;">${dateGen}</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Gold divider -->
          <tr>
            <td style="height:3px;background:linear-gradient(90deg,#a87830,#c9a84c 50%,#a87830);"></td>
          </tr>

          <!-- Student Info -->
          <tr>
            <td style="padding:24px 36px 20px;background:#faf8f2;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" style="padding-bottom:10px;">
                    <div style="font-size:10px;font-weight:700;color:#a8893a;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">Student Name</div>
                    <div style="font-size:14px;font-weight:600;color:#0a2414;">${displayName}</div>
                  </td>
                  <td width="50%" style="padding-bottom:10px;">
                    <div style="font-size:10px;font-weight:700;color:#a8893a;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">Student ID</div>
                    <div style="font-size:14px;font-weight:600;color:#0a2414;">${studentId || 'N/A'}</div>
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="padding-bottom:10px;">
                    <div style="font-size:10px;font-weight:700;color:#a8893a;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">Course</div>
                    <div style="font-size:14px;color:#1a1a1a;">${course || 'N/A'}</div>
                  </td>
                  <td width="50%" style="padding-bottom:10px;">
                    <div style="font-size:10px;font-weight:700;color:#a8893a;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">Year Level</div>
                    <div style="font-size:14px;color:#1a1a1a;">${yearLevel || 'N/A'}</div>
                  </td>
                </tr>
                <tr>
                  <td width="50%">
                    <div style="font-size:10px;font-weight:700;color:#a8893a;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">School Year</div>
                    <div style="font-size:14px;color:#1a1a1a;">${schoolYear || 'N/A'}</div>
                  </td>
                  <td width="50%">
                    <div style="font-size:10px;font-weight:700;color:#a8893a;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">Semester</div>
                    <div style="font-size:14px;color:#1a1a1a;">${semLabel || 'N/A'}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Grades Table -->
          <tr>
            <td style="padding:0 36px 24px;">
              <div style="font-size:11px;font-weight:700;color:#a8893a;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px;margin-top:8px;">Subject Grades</div>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
                <thead>
                  <tr style="background:#0a2414;">
                    <th style="padding:10px 12px;text-align:left;color:#c9a84c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #143d20;">Code</th>
                    <th style="padding:10px 12px;text-align:left;color:#c9a84c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #143d20;">Subject</th>
                    <th style="padding:10px 12px;text-align:center;color:#c9a84c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #143d20;">Units</th>
                    <th style="padding:10px 12px;text-align:center;color:#c9a84c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #143d20;">Midterm</th>
                    <th style="padding:10px 12px;text-align:center;color:#c9a84c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #143d20;">Finals</th>
                    <th style="padding:10px 12px;text-align:center;color:#c9a84c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #143d20;">Final Grade</th>
                    <th style="padding:10px 12px;text-align:center;color:#c9a84c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #143d20;">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  ${gradeRows}
                </tbody>
              </table>

              ${gwa ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
                <tr>
                  <td align="right" style="padding-right:4px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:10px 18px;background:#0a2414;border-radius:6px;">
                          <span style="font-size:11px;color:#c9a84c;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-right:14px;">General Weighted Average</span>
                          <span style="font-size:20px;font-weight:700;color:#f5edd8;">${gwa}</span>
                          ${remarks ? `<span style="margin-left:12px;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:${remarks.toLowerCase().includes('pass') ? '#1a7a3a' : '#c0392b'};color:#fff;">${remarks}</span>` : ''}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>` : ''}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 36px;"><div style="height:1px;background:#e8e0cc;"></div></td>
          </tr>

          <!-- Disclaimer -->
          <tr>
            <td style="padding:20px 36px 28px;">
              <div style="background:#f5f0e4;border-left:3px solid #c9a84c;border-radius:4px;padding:14px 16px;">
                <div style="font-size:10px;font-weight:700;color:#a8893a;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Disclaimer</div>
                <p style="font-size:11px;color:#666;line-height:1.7;margin:0;">
                  This system (<strong>BCC Portal</strong>) is an unofficial tool created and maintained for students who have forgotten their login credentials to the official Buenavista Community College portal. All data presented in this document is retrieved directly from the official BCC portal (<em>portal.buenavistacommunitycollege.edu.ph</em>) via HTTP GET requests and is not stored, modified, or retained by this system. This document is intended solely for the personal reference of the requesting student. For official records and certified copies, please contact the <strong>BCC Registrar&rsquo;s Office</strong>.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0a2414;padding:16px 36px;text-align:center;">
              <div style="font-size:11px;color:#6e8c5e;">BCC Portal &mdash; Unofficial Student Records Access Tool</div>
              <div style="font-size:10px;color:#3a5a30;margin-top:4px;">This email was sent at your request. Do not reply to this message.</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

    const safeTitle = (reportTitle || 'Grade_Report').replace(/[^a-zA-Z0-9_\- |]/g, '').replace(/\s+/g, '_');

    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'BCC Portal'}" <${process.env.SMTP_USER}>`,
      to:   email,
      subject: `Request Copy – ${reportTitle}`,
      html: htmlEmail,
      attachments: [
        {
          filename:    `BCC_Grade_Report_${safeTitle}.xlsx`,
          content:     Buffer.from(xlsBuffer),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    });

    res.json({ success: true, message: `Grade report sent to ${email}` });
  } catch (err) {
    console.error('Send grades error:', err.message);
    res.status(500).json({ error: 'Failed to send email. Please check the address and try again.' });
  }
});

// ── Catch-all for React in production ────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

app.listen(PORT, () => console.log(`BCC Portal server running on port ${PORT}`));

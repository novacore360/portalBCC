// Add this to your server/index.js after the existing endpoints

const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');

// ── Email configuration ──────────────────────────────────────────────────────

// Configure your Gmail SMTP settings
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  }
});

// ── Generate HTML email with grades table ──────────────────────────────────

function generateGradeEmailHTML(studentName, studentId, schoolYear, semester, course, yearLevel, grades, gwa, remarks) {
  const gradeRows = grades.map(g => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${g.subjectCode || ''}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${g.subjectTitle || ''}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">${g.units || ''}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">${g.midterm || ''}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">${g.finals || ''}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${g.finalGrade || ''}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">
        <span style="display: inline-block; padding: 2px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; ${g.remarks?.toLowerCase().includes('pass') ? 'background: #d4edda; color: #155724;' : 'background: #f8d7da; color: #721c24;'}">
          ${g.remarks || 'N/A'}
        </span>
      </td>
    </tr>
  `).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grade Report - ${studentName}</title>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        margin: 0;
        padding: 0;
        background: #f7fafc;
        color: #1a202c;
      }
      .container {
        max-width: 800px;
        margin: 20px auto;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.08);
        overflow: hidden;
      }
      .header {
        background: linear-gradient(135deg, #0A2414 0%, #143D20 100%);
        padding: 32px 40px;
        border-bottom: 4px solid #C9A84C;
      }
      .header h1 {
        color: #E2C36A;
        margin: 0 0 4px 0;
        font-size: 28px;
        font-weight: 700;
        letter-spacing: -0.5px;
      }
      .header .subtitle {
        color: #B8C9A8;
        font-size: 14px;
        margin: 0;
      }
      .header .gold-line {
        width: 60px;
        height: 3px;
        background: #C9A84C;
        margin-top: 12px;
        border-radius: 2px;
      }
      .student-info {
        padding: 24px 40px;
        background: #f9fafb;
        border-bottom: 1px solid #e2e8f0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px 24px;
      }
      .student-info .label {
        font-size: 12px;
        color: #6B7280;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .student-info .value {
        font-size: 15px;
        font-weight: 500;
        color: #1a202c;
      }
      .gwa-section {
        padding: 20px 40px;
        background: #f0fdf4;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
      }
      .gwa-section .gwa-label {
        font-size: 14px;
        font-weight: 600;
        color: #065f46;
      }
      .gwa-section .gwa-value {
        font-size: 28px;
        font-weight: 700;
        color: #065f46;
        letter-spacing: -1px;
      }
      .gwa-section .gwa-remarks {
        display: inline-block;
        padding: 4px 16px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 600;
        ${remarks?.toLowerCase().includes('pass') ? 'background: #d4edda; color: #155724;' : 'background: #f8d7da; color: #721c24;'}
      }
      .table-wrap {
        padding: 24px 40px 32px;
        overflow-x: auto;
      }
      .table-wrap h2 {
        font-size: 16px;
        font-weight: 600;
        color: #1a202c;
        margin: 0 0 16px 0;
        letter-spacing: -0.2px;
      }
      .grade-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      .grade-table thead th {
        background: #f1f5f9;
        padding: 10px 12px;
        text-align: left;
        font-weight: 600;
        color: #1e293b;
        border-bottom: 2px solid #e2e8f0;
      }
      .grade-table tbody td {
        padding: 10px 12px;
        border-bottom: 1px solid #e2e8f0;
        color: #334155;
      }
      .grade-table tbody tr:hover {
        background: #f8fafc;
      }
      .footer {
        padding: 20px 40px;
        background: #f9fafb;
        border-top: 1px solid #e2e8f0;
        text-align: center;
        font-size: 13px;
        color: #6B7280;
      }
      .footer a {
        color: #C9A84C;
        text-decoration: none;
      }
      .footer a:hover {
        text-decoration: underline;
      }
      @media (max-width: 600px) {
        .header { padding: 24px 20px; }
        .student-info { padding: 16px 20px; grid-template-columns: 1fr; gap: 4px; }
        .gwa-section { padding: 16px 20px; flex-direction: column; align-items: flex-start; }
        .table-wrap { padding: 16px 20px; }
        .grade-table { font-size: 12px; }
        .grade-table thead th, .grade-table tbody td { padding: 6px 8px; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>📘 Buenavista Community College</h1>
        <p class="subtitle">Official Grade Report</p>
        <div class="gold-line"></div>
      </div>

      <div class="student-info">
        <div>
          <div class="label">Student Name</div>
          <div class="value">${studentName || 'N/A'}</div>
        </div>
        <div>
          <div class="label">Student ID</div>
          <div class="value">${studentId || 'N/A'}</div>
        </div>
        <div>
          <div class="label">Course</div>
          <div class="value">${course || 'N/A'}</div>
        </div>
        <div>
          <div class="label">Year Level</div>
          <div class="value">${yearLevel || 'N/A'}</div>
        </div>
        <div>
          <div class="label">School Year</div>
          <div class="value">${schoolYear || 'N/A'}</div>
        </div>
        <div>
          <div class="label">Semester</div>
          <div class="value">${semester || 'N/A'}</div>
        </div>
      </div>

      ${gwa && gwa !== 'N/A' ? `
      <div class="gwa-section">
        <span class="gwa-label">📊 General Weighted Average</span>
        <span class="gwa-value">${gwa}</span>
        <span class="gwa-remarks">${remarks || 'N/A'}</span>
      </div>
      ` : ''}

      <div class="table-wrap">
        <h2>📋 Subject Grades</h2>
        ${grades && grades.length > 0 ? `
        <table class="grade-table">
          <thead>
            <tr>
              <th>Subject Code</th>
              <th>Description</th>
              <th style="text-align:center;">Units</th>
              <th style="text-align:center;">Midterm</th>
              <th style="text-align:center;">Finals</th>
              <th style="text-align:center;">Final Grade</th>
              <th style="text-align:center;">Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${gradeRows}
          </tbody>
        </table>
        ` : `
        <p style="color: #6B7280; text-align: center; padding: 24px 0;">No grade records available.</p>
        `}
      </div>

      <div class="footer">
        <p style="margin: 0 0 4px 0;">
          This is an automated report from <a href="#">BCC Student Portal</a>
        </p>
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          Generated on ${new Date().toLocaleString()}
        </p>
      </div>
    </div>
  </body>
  </html>
  `;
}

// ── Create Excel file from grades data ──────────────────────────────────────

async function createGradesExcel(studentName, studentId, schoolYear, semester, course, yearLevel, grades, gwa, remarks) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BCC Portal';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Grades', {
    properties: { tabColor: { argb: 'C9A84C' } },
    pageSetup: { orientation: 'landscape', fitToPage: true }
  });

  // ── Header section ──────────────────────────────────────────────────────────
  sheet.mergeCells('A1:G1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'BUENAVISTA COMMUNITY COLLEGE';
  titleCell.font = { size: 16, bold: true, color: { argb: '0A2414' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:G2');
  const subCell = sheet.getCell('A2');
  subCell.value = 'Official Grade Report';
  subCell.font = { size: 12, italic: true, color: { argb: '6B7280' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // ── Student info ────────────────────────────────────────────────────────────
  const infoData = [
    ['Student Name:', studentName || 'N/A', '', 'Student ID:', studentId || 'N/A'],
    ['Course:', course || 'N/A', '', 'Year Level:', yearLevel || 'N/A'],
    ['School Year:', schoolYear || 'N/A', '', 'Semester:', semester || 'N/A'],
  ];

  infoData.forEach((row, idx) => {
    const rowNum = idx + 4;
    sheet.getRow(rowNum).values = row;
    sheet.getRow(rowNum).font = { size: 11 };
    // Bold the labels
    sheet.getCell(`A${rowNum}`).font = { bold: true, size: 11 };
    sheet.getCell(`C${rowNum}`).font = { bold: true, size: 11 };
  });

  // ── GWA row ─────────────────────────────────────────────────────────────────
  const gwaRow = 7;
  sheet.mergeCells(`A${gwaRow}:E${gwaRow}`);
  sheet.getCell(`A${gwaRow}`).value = `General Weighted Average: ${gwa || 'N/A'}`;
  sheet.getCell(`A${gwaRow}`).font = { size: 12, bold: true };
  sheet.getCell(`A${gwaRow}`).alignment = { horizontal: 'left' };

  sheet.mergeCells(`F${gwaRow}:G${gwaRow}`);
  sheet.getCell(`F${gwaRow}`).value = `Remarks: ${remarks || 'N/A'}`;
  sheet.getCell(`F${gwaRow}`).font = { size: 12 };
  sheet.getCell(`F${gwaRow}`).alignment = { horizontal: 'right' };

  // ── Grades table ────────────────────────────────────────────────────────────
  const headers = ['Subject Code', 'Description', 'Units', 'Midterm', 'Finals', 'Final Grade', 'Remarks'];
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '0A2414' }
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 28;

  // ── Add grade rows ─────────────────────────────────────────────────────────
  if (grades && grades.length > 0) {
    grades.forEach(g => {
      const row = sheet.addRow([
        g.subjectCode || '',
        g.subjectTitle || '',
        g.units || '',
        g.midterm || '',
        g.finals || '',
        g.finalGrade || '',
        g.remarks || 'N/A'
      ]);
      row.alignment = { vertical: 'middle' };
      row.height = 24;
      // Color the final grade based on value
      const finalGrade = parseFloat(g.finalGrade);
      if (!isNaN(finalGrade) && finalGrade > 0) {
        const cell = row.getCell(6);
        if (finalGrade <= 2.5) {
          cell.font = { color: { argb: '008000' }, bold: true };
        } else if (finalGrade <= 3.0) {
          cell.font = { color: { argb: 'FF8C00' }, bold: true };
        } else {
          cell.font = { color: { argb: 'FF0000' }, bold: true };
        }
      }
      // Color remarks
      const remarksCell = row.getCell(7);
      if (g.remarks?.toLowerCase().includes('pass')) {
        remarksCell.font = { color: { argb: '008000' }, bold: true };
      } else if (g.remarks?.toLowerCase().includes('fail')) {
        remarksCell.font = { color: { argb: 'FF0000' }, bold: true };
      }
    });
  }

  // ── Auto column widths ─────────────────────────────────────────────────────
  sheet.getColumn(1).width = 18;
  sheet.getColumn(2).width = 35;
  sheet.getColumn(3).width = 10;
  sheet.getColumn(4).width = 14;
  sheet.getColumn(5).width = 14;
  sheet.getColumn(6).width = 14;
  sheet.getColumn(7).width = 16;

  // ── Borders ─────────────────────────────────────────────────────────────────
  const borderStyle = {
    top: { style: 'thin', color: { argb: 'D1D5DB' } },
    left: { style: 'thin', color: { argb: 'D1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'D1D5DB' } },
    right: { style: 'thin', color: { argb: 'D1D5DB' } }
  };

  sheet.eachRow(row => {
    row.eachCell(cell => {
      cell.border = borderStyle;
    });
  });

  // ── Footer ──────────────────────────────────────────────────────────────────
  const footerRow = sheet.addRow([`Generated on ${new Date().toLocaleString()}`]);
  footerRow.font = { size: 9, color: { argb: '9CA3AF' } };
  sheet.mergeCells(`A${footerRow.number}:G${footerRow.number}`);
  sheet.getCell(`A${footerRow.number}`).alignment = { horizontal: 'center' };

  return workbook;
}

// ── Send grades email endpoint ──────────────────────────────────────────────

app.post('/api/send-grades', async (req, res) => {
  try {
    const { email, enrollmentId, studentName, schoolYear, semester, course, yearLevel, grades, gwa, remarks } = req.body;

    if (!email || !enrollmentId) {
      return res.status(400).json({ error: 'Email and enrollment ID are required.' });
    }

    // ── Get student ID from enrollment ──────────────────────────────────────
    // If studentId is not provided, we can fetch it from the enrollment data
    // For now, we'll use what's available

    const studentId = req.body.studentId || 'N/A';

    // ── Create Excel file ────────────────────────────────────────────────────
    const workbook = await createGradesExcel(
      studentName || 'Student',
      studentId,
      schoolYear || 'N/A',
      semester || 'N/A',
      course || 'N/A',
      yearLevel || 'N/A',
      grades || [],
      gwa || 'N/A',
      remarks || 'N/A'
    );

    const excelBuffer = await workbook.xlsx.writeBuffer();

    // ── Generate HTML email ──────────────────────────────────────────────────
    const htmlContent = generateGradeEmailHTML(
      studentName || 'Student',
      studentId,
      schoolYear || 'N/A',
      semesterLabel(semester) || semester || 'N/A',
      course || 'N/A',
      yearLevel || 'N/A',
      grades || [],
      gwa || 'N/A',
      remarks || 'N/A'
    );

    // ── Send email ──────────────────────────────────────────────────────────
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: email,
      subject: `📘 Grade Report - ${studentName || 'Student'} (${schoolYear || ''} ${semester || ''})`,
      html: htmlContent,
      attachments: [{
        filename: `Grades_${studentName?.replace(/\s/g, '_') || 'Student'}_${schoolYear || ''}_${semester || ''}.xlsx`,
        content: excelBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }]
    };

    await transporter.sendMail(mailOptions);

    res.json({ success: true, message: 'Email sent successfully!' });

  } catch (err) {
    console.error('Send email error:', err);
    res.status(500).json({ error: err.message || 'Failed to send email.' });
  }
});

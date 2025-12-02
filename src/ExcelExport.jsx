import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";

export default function ExcelExport({ attendances }) {
  const [range, setRange] = useState("");
  const [options, setOptions] = useState([]);

  function to12Hour(time) {
    if (!time) return "12:00 AM";
    let [h, m] = time.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12; // convert 0 → 12
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")} ${suffix}`;
  }

  useEffect(() => {
    if (!attendances || !attendances.length) return;

    // Convert attendances to Date objects
    const dates = attendances.map((a) => new Date(a.attend.replace(" ", "T")));

    // Group by month/year
    const grouped = {};
    dates.forEach((d) => {
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`; // e.g. "2025-11"
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(d);
    });

    const newOptions = [];

    for (const key in grouped) {
      const [year, month] = key.split("-").map(Number);
      const monthDates = grouped[key];
      const lastDay = new Date(year, month, 0).getDate();

      // Check 1-15
      if (monthDates.some((d) => d.getDate() >= 1 && d.getDate() <= 15)) {
        newOptions.push({
          label: `1/${month} - 15/${month}`,
          value: `${year}-${month}-1-15`,
        });
      }

      // Check 16 - end
      if (monthDates.some((d) => d.getDate() >= 16 && d.getDate() <= lastDay)) {
        newOptions.push({
          label: `16/${month} - ${lastDay}/${month}`,
          value: `${year}-${month}-16-${lastDay}`,
        });
      }
    }

    setOptions(newOptions);
  }, [attendances]);

  const exportExcel = () => {
    if (!range) return alert("Please select a range first.");

    // Parse selected range
    const [year, month, startDay, endDay] = range.split("-").map(Number);

    // Filter range
    const filtered = attendances.filter((a) => {
      const d = new Date(a.attend.replace(" ", "T"));
      return (
        d.getFullYear() === year &&
        d.getMonth() + 1 === month &&
        d.getDate() >= startDay &&
        d.getDate() <= endDay
      );
    });

    if (!filtered.length) return alert("No records in this range.");

    // ---- SORT ASCENDING BY DATE ----
    filtered.sort(
      (a, b) =>
        new Date(a.attend.replace(" ", "T")) -
        new Date(b.attend.replace(" ", "T"))
    );

    // ---- FORMAT FOR EXCEL ----
    const sheetData = filtered.map((a) => {
      const d = new Date(a.attend.replace(" ", "T"));
      const day = d.toLocaleDateString("en-GB"); // DD/MM/YYYY

      const rawAttendTime = a.attend.split(" ")[1]; // "13:45"
      const rawLeaveTime = a.leave.split(" ")[1] || "00:00";

      const attendTime = to12Hour(rawAttendTime); // "01:45 PM"
      const leaveTime = to12Hour(rawLeaveTime); // "12:00 AM"

      return {
        Date: day, // "20/11/2025"
        Attend: attendTime, // "01:12"
        Leave: leaveTime, // "10:00"
      };
    });

    // Create workbook
    const ws = XLSX.utils.json_to_sheet(sheetData);
    /*********************************
     *   AUTO COLUMN WIDTHS
     *********************************/
    const colWidths = Object.keys(sheetData[0]).map((key) => {
      const maxLength = Math.max(
        key.length,
        ...sheetData.map((row) => row[key]?.toString().length || 0)
      );
      return { wch: maxLength + 2 }; // padding for readability
    });
    ws["!cols"] = colWidths;

    /*********************************
     *   BORDER STYLE
     *********************************/
    const borderStyle = {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } },
    };

    /*********************************
     *   APPLY STYLES TO EVERY CELL
     *********************************/
    Object.keys(ws).forEach((cell) => {
      if (cell[0] === "!") return; // skip metadata

      if (!ws[cell].s) ws[cell].s = {};

      ws[cell].s.font = { sz: 16 }; // font size 16
      ws[cell].s.border = borderStyle;
      ws[cell].s.alignment = { horizontal: "center", vertical: "center" };
    });

    /*********************************
     *   HEADER ROW (A1:C1)
     *********************************/
    const headerCells = ["A1", "B1", "C1"];
    headerCells.forEach((cell) => {
      ws[cell].s = {
        font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "4F81BD" } }, // soft blue header
        alignment: { horizontal: "center", vertical: "center" },
        border: borderStyle,
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${startDay}-${endDay}_${month}`);

    XLSX.writeFile(
      wb,
      `Attendance_${startDay}-${endDay}_${month}_${year}.xlsx`
    );
  };

  return (
    <div className="mt-4">
      <div className="flex gap-2 items-center mb-2">
        <label>Select Range:</label>
        <select
          className="border rounded px-2 py-1"
          value={range}
          onChange={(e) => setRange(e.target.value)}
        >
          <option value="">-- Select --</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <button
        className="px-4 py-2 bg-green-600 text-white rounded"
        onClick={exportExcel}
      >
        Download Excel
      </button>
    </div>
  );
}

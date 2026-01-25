import React, { useState } from "react";
import { saveAs } from "file-saver";

export default function ExcelExport({ attendances, user }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  function to12Hour(time) {
    if (!time) return "12:00 AM";
    let [h, m] = time.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12; // convert 0 → 12
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")} ${suffix}`;
  }

  // compute today's date string for max attributes
  const todayStr = new Date().toISOString().slice(0, 10);

  // derive minimum date from localStorage (earliest attendance stored)
  function getMinDateFromStorage() {
    try {
      const stored = JSON.parse(localStorage.getItem("attendance") || "[]");
      if (!stored || !stored.length) return "";
      let min = null;
      for (const a of stored) {
        if (a.attend) {
          const d = a.attend.split(" ")[0];
          if (!min || d < min) min = d;
        } else if (a.day) {
          const dt = new Date(a.day);
          if (!isNaN(dt)) {
            const iso = dt.toISOString().slice(0, 10);
            if (!min || iso < min) min = iso;
          }
        }
      }
      return min || "";
    } catch (err) {
      console.debug("Failed to read attendance from localStorage", err);
      return "";
    }
  }

  const minStoredDate = getMinDateFromStorage();

  const exportPdf = async () => {
    if (!startDate || !endDate)
      return alert("Please select both start and end dates first.");

    // if end < start, swap silently
    let s = startDate;
    let e = endDate;
    if (e < s) {
      const tmp = s;
      s = e;
      e = tmp;
    }

    const startBound = new Date(`${s}T00:00:00`);
    const endBound = new Date(`${e}T23:59:59`);

    const filtered = attendances.filter((a) => {
      const d = new Date(a.attend.replace(" ", "T"));
      return d >= startBound && d <= endBound;
    });

    if (!filtered.length) return alert("No records in this range.");

    // sort ascending by attend datetime
    filtered.sort((a, b) =>
      new Date(a.attend.replace(" ", "T")) -
      new Date(b.attend.replace(" ", "T")),
    );

    const rows = filtered.map((a) => {
      const d = new Date(a.attend.replace(" ", "T"));
      const day = d.toLocaleDateString("en-GB");
      const rawAttend = a.attend.split(" ")[1] || "00:00";
      const rawLeave = a.leave ? a.leave.split(" ")[1] : "00:00";
      return [day, to12Hour(rawAttend), to12Hour(rawLeave)];
    });

    // Load pdfMake in a way that avoids Vite's static import analysis.
    // Strategy: (1) use global window.pdfMake if present, (2) try an opaque dynamic import via new Function,
    // (3) fallback to loading pdfMake from CDN. This prevents the dev server from failing to pre-resolve
    // the import when the package isn't installed.
    async function getPdfMake() {
      if (typeof window !== "undefined" && window.pdfMake)
        return window.pdfMake;

      // Try an opaque dynamic import to avoid Vite's import analysis.
      try {
        const mod = await new Function(
          'return import("pdfmake/build/pdfmake")',
        )();
        return mod && (mod.default || mod);
      } catch (err) {
        // ignore and try CDN
        console.debug("Opaque import failed, will try CDN: ", err);
      }

      // Fallback: prefer loading a same-origin copy first (public/libs/pdfmake.min.js)
      // This avoids browser tracking-prevention blocks that happen for third-party CDNs.
      const tryLoadScript = async (src) => {
        return await new Promise((resolve, reject) => {
          const existing = document.querySelector(
            `script[data-pdfmake-src="${src}"]`,
          );
          if (existing) {
            existing.addEventListener("load", () => resolve(true));
            existing.addEventListener("error", () =>
              reject(new Error("script load error")),
            );
            return;
          }
          const script = document.createElement("script");
          script.setAttribute("data-pdfmake-src", src);
          script.src = src;
          script.onload = () => resolve(true);
          script.onerror = () =>
            reject(new Error(`Failed to load script ${src}`));
          document.head.appendChild(script);
        });
      };

      try {
        // try a local copy served from /libs first
        try {
          await tryLoadScript("/libs/pdfmake.min.js");
          if (window.pdfMake) return window.pdfMake;
        } catch (localErr) {
          console.debug(
            "No local pdfmake at /libs/pdfmake.min.js, will try CDN",
            localErr,
          );
        }

        // then try CDN (last resort)
        await tryLoadScript(
          "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js",
        );
        if (window.pdfMake) return window.pdfMake;
      } catch (err) {
        console.error("Failed to load pdfmake from scripts", err);
      }

      return null;
    }

    const pdfMakeLib = await getPdfMake();
    if (!pdfMakeLib) {
      alert(
        "pdfmake is not available. Please run 'npm install' in the project folder (this copies the browser builds into public/libs) or allow loading from CDN.",
      );
      return;
    }

    // Ensure pdfMake has its VFS (Roboto) available. If not present, try loading vfs_fonts.js
    async function ensureVfsFonts() {
      const loadVfsScript = async (src) =>
        new Promise((resolve, reject) => {
          const existing = document.querySelector(
            `script[data-pdfmake-vfs-src="${src}"]`,
          );
          if (existing) {
            existing.addEventListener("load", () => resolve(true));
            existing.addEventListener("error", () =>
              reject(new Error("vfs script load error")),
            );
            return;
          }
          const s = document.createElement("script");
          s.setAttribute("data-pdfmake-vfs-src", src);
          s.src = src;
          s.onload = () => resolve(true);
          s.onerror = () => reject(new Error(`Failed to load script ${src}`));
          document.head.appendChild(s);
        });

      // Try local copy first
      try {
        await loadVfsScript("/libs/vfs_fonts.js");
      } catch {
        // try CDN as last resort
        try {
          await loadVfsScript(
            "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js",
          );
        } catch {
          console.debug("Failed to load vfs_fonts.js locally or from CDN");
        }
      }

      // If global window.pdfMake populated vfs, copy to pdfMakeLib
      if (window.pdfMake && window.pdfMake.vfs) {
        pdfMakeLib.vfs = pdfMakeLib.vfs || {};
        Object.assign(pdfMakeLib.vfs, window.pdfMake.vfs);
      }

      // Check for Roboto entries which pdfMake expects by default
      const hasRoboto =
        pdfMakeLib.vfs &&
        (pdfMakeLib.vfs["Roboto-Medium.ttf"] ||
          pdfMakeLib.vfs["Roboto-Regular.ttf"] ||
          pdfMakeLib.vfs["Roboto.ttf"]);
      if (!hasRoboto) {
        alert(
          "pdfMake virtual font files (vfs_fonts.js) not found or missing Roboto fonts.\n\n" +
            "Make sure you have copied pdfmake's browser build files into public/libs (run `npm install`) or allow loading vfs_fonts.js from the CDN.\n\n" +
            "Without these files PDF generation will fail with 'File Roboto-Medium.ttf not found in virtual file system'.",
        );
        return false;
      }

      return true;
    }

    const vfsOk = await ensureVfsFonts();
    if (!vfsOk) return;

    // Simplified PDF generation: modernized layout
    const fontRegistered = false;
    const fontFamily = "Roboto";

    // Header: plain user name (no parentheses) at the top-left, black text, no background
    const docDefinition = {
      pageMargins: [22, 22, 22, 22],
      defaultStyle: {
        font: fontRegistered ? fontFamily : "Roboto",
        fontSize: 11,
        color: "#000000",
      },
      content: [],
    };

    if (user && user.trim()) {
      docDefinition.content.push({
        text: user.trim(),
        style: "userHeader",
        alignment: "left",
        margin: [0, 0, 0, 6],
      });
    }

    // Build table body with header row styled
    const headerRow = [
      { text: "Date", style: "tableHeader" },
      { text: "Attend", style: "tableHeader" },
      { text: "Leave", style: "tableHeader" },
    ];

    const tableBody = [headerRow, ...rows];

    docDefinition.content.push({
      table: {
        headerRows: 1,
        widths: ["*", 120, 120],
        body: tableBody,
      },
      layout: {
        fillColor: function (rowIndex) {
          // header row
          if (rowIndex === 0) return "#E6F7FF";
          // alternating rows: even rows (2,4,...) get light gray, odd rows white
          return rowIndex % 2 === 0 ? "#F7F7F7" : null;
        },
        hLineWidth: function (i, node) {
          return i === 0 || i === node.table.body.length ? 0 : 0.5;
        },
        vLineWidth: function () {
          return 0;
        },
      },
      margin: [0, 6, 0, 0],
    });

    docDefinition.styles = {
      userHeader: { fontSize: 14, bold: true, color: "#000000" },
      tableHeader: { fontSize: 12, bold: true, color: "#000000" },
    };

  // generate and download using getBlob + file-saver to avoid pdfMake internal
  // download/iframe reuse issues that sometimes require a reload to work again.
  const filename = `Attendance_${s}_${e}.pdf`;
    try {
      pdfMakeLib.createPdf(docDefinition).getBlob((blob) => {
        try {
          saveAs(blob, filename);
        } catch (err) {
          console.error("Failed to save PDF blob:", err);
          alert("Failed to save PDF file. See console for details.");
        }
      });
    } catch (err) {
      console.error("pdfMake createPdf/getBlob error:", err);
      alert(
        "PDF generation failed. If this keeps happening, try reloading the page and ensure pdfMake/vfs_fonts are loaded.",
      );
    }
  };

  return (
    <div className="mt-4">
      <div className="flex gap-2 items-center mb-2">
        <label className="font-semibold">Start Date:</label>
        <input
          type="date"
          className="border rounded px-2 py-1"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          max={todayStr}
          min={minStoredDate || undefined}
        />

        <label className="font-semibold">End Date:</label>
        <input
          type="date"
          className="border rounded px-2 py-1"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          max={todayStr}
          min={minStoredDate || undefined}
        />
      </div>

      {minStoredDate ? (
        <div className="text-xs text-gray-500 mb-2">
          Earliest stored record: <span className="font-medium">{minStoredDate}</span>
        </div>
      ) : (
        <div className="text-xs text-gray-500 mb-2">No stored attendance records.</div>
      )}

      <button
        className="px-4 py-2 bg-green-600 text-white rounded"
        onClick={exportPdf}
      >
        Download PDF
      </button>
    </div>
  );
}

import { useEffect, useState } from "react";
import ExcelExport from "./ExcelExport";

const localDatetimeString = (dateObj) => {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  const hh = String(dateObj.getHours()).padStart(2, "0");
  const min = String(dateObj.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
};

const parseLocal = (str) => {
  // "YYYY-MM-DD HH:MM" -> Date (local)
  if (!str) return null;
  // replace space with 'T' to create "YYYY-MM-DDTHH:MM" then build Date
  return new Date(str.replace(" ", "T"));
};

const formatTime12 = (str) => {
  if (!str) return "";
  const d = parseLocal(str);
  return d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const formatDateGB = (str) => {
  if (!str) return "";
  const d = parseLocal(str);
  return d.toLocaleDateString("en-GB");
};

const calculateHours = (attend, leave) => {
  if (!attend || !leave) return 0;
  const start = parseLocal(attend);
  const end = parseLocal(leave);
  const diff = (end - start) / (1000 * 60 * 60);
  return diff > 0 ? diff : 0;
};

// Excel export implementation was moved to `src/ExcelExport.jsx` (PDF export).

/* -------------------- Main Attendance Component -------------------- */

export default function Attendance() {
  const [attendances, setAttendances] = useState([]);
  // persisted user name for exports
  const [user, setUser] = useState(
    () => localStorage.getItem("attendanceUser") || "",
  );
  const [userInput, setUserInput] = useState(user || "");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editAttend, setEditAttend] = useState("");
  const [editLeave, setEditLeave] = useState("");

  const [showAddDay, setShowAddDay] = useState(false);
  const [newDay, setNewDay] = useState("");
  const [newAttend, setNewAttend] = useState("");
  const [newLeave, setNewLeave] = useState("");

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });

  // shift rules
  const shiftHours = 8;
  const isOvertime = (h) => h > shiftHours;

  function loadAttendance() {
    setLoading(true);
    const stored = JSON.parse(localStorage.getItem("attendance") || "[]");
    setAttendances(stored);
    setLoading(false);
  }

  useEffect(() => {
    loadAttendance();
  }, []);

  /* ---------- Basic actions ---------- */

  const handleAttend = () => {
    const now = new Date();
    const todayKey = now.toDateString();
    const alreadyToday = attendances.find((a) => a.day === todayKey);
    if (alreadyToday?.attend) {
      alert("Already attended today.");
      return;
    }
    const record = {
      id: Date.now(),
      day: todayKey,
      attend: localDatetimeString(now),
      leave: "",
    };
    const updated = [...attendances, record];
    localStorage.setItem("attendance", JSON.stringify(updated));
    setAttendances(updated);
  };

  const handleLeave = (id) => {
    const now = new Date();
    // find record, set leave possibly next day if needed (here using now so it's correct)
    const updated = attendances.map((a) =>
      a.id === id ? { ...a, leave: localDatetimeString(now) } : a,
    );
    localStorage.setItem("attendance", JSON.stringify(updated));
    setAttendances(updated);
  };

  // Delete a record permanently
  const deleteRecord = (id) => {
    const rec = attendances.find((a) => a.id === id);
    const label = rec ? formatDateGB(rec.attend) || rec.day : "this record";
    if (!confirm(`Delete record for ${label}? This cannot be undone.`)) return;
    const updated = attendances.filter((a) => a.id !== id);
    localStorage.setItem("attendance", JSON.stringify(updated));
    setAttendances(updated);
  };

  /* ---------- Edit ---------- */

  const startEdit = (record) => {
    setEditing(record.id);

    const attend = record.attend ? parseLocal(record.attend) : null;
    const leave = record.leave ? parseLocal(record.leave) : null;

    setEditAttend(
      attend
        ? `${String(attend.getHours()).padStart(2, "0")}:${String(
            attend.getMinutes(),
          ).padStart(2, "0")}`
        : "",
    );
    setEditLeave(
      leave
        ? `${String(leave.getHours()).padStart(2, "0")}:${String(
            leave.getMinutes(),
          ).padStart(2, "0")}`
        : "",
    );
  };

  const saveEdit = (id) => {
    let updated = attendances.map((a) => {
      if (a.id !== id) return a;

      const attDate = parseLocal(a.attend);

      let newAttend = a.attend;
      let newLeave = a.leave;

      if (editAttend) {
        const [hh, mm] = editAttend.split(":").map(Number);
        const attCopy = new Date(attDate);
        attCopy.setHours(hh, mm, 0, 0);
        newAttend = localDatetimeString(attCopy);
      }

      if (editLeave) {
        // use attend's date as base for leave
        const base = new Date(newAttend.replace(" ", "T"));
        const [lh, lm] = editLeave.split(":").map(Number);
        const correctedLeave = new Date(base);
        correctedLeave.setHours(lh, lm, 0, 0);

        // If leave <= attend -> roll to next day
        if (correctedLeave <= new Date(newAttend.replace(" ", "T"))) {
          correctedLeave.setDate(correctedLeave.getDate() + 1);
        }
        newLeave = localDatetimeString(correctedLeave);
      }

      return { ...a, attend: newAttend, leave: newLeave };
    });

    // NOTE: previously the app auto-created a previous-day record after edits.
    // That behavior has been removed. Edits no longer create extra records.

    localStorage.setItem("attendance", JSON.stringify(updated));
    setAttendances(updated);
    setEditing(null);
    setEditAttend("");
    setEditLeave("");
  };

  /* ---------- Add manual day (with overnight fix) ---------- */

  const handleAddManualDay = () => {
    if (!newDay || !newAttend || !newLeave) {
      alert("Please enter date, attend time, and leave time.");
      return;
    }

    // Date rules
    const selectedDate = new Date(newDay);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limit = new Date(today);
    limit.setDate(limit.getDate() - 90);

    if (selectedDate > today) {
      alert("You cannot add any future date.");
      return;
    }
    if (selectedDate < limit) {
      alert("You can only add days from the past 90 days.");
      return;
    }

    const dayKey = selectedDate.toDateString();
    const exists = attendances.some((a) => a.day === dayKey);
    if (exists) {
      alert("Day already exists!");
      return;
    }

    // Build attend and leave Date objects locally
    const attendDate = new Date(`${newDay}T${newAttend}`);
    let leaveDate = new Date(`${newDay}T${newLeave}`);

    // If leave <= attend -> move leave to next day
    if (leaveDate <= attendDate) {
      leaveDate.setDate(leaveDate.getDate() + 1);
    }

    const record = {
      id: Date.now(),
      day: dayKey,
      attend: localDatetimeString(attendDate),
      leave: localDatetimeString(leaveDate),
    };

    const updated = [...attendances, record];
    localStorage.setItem("attendance", JSON.stringify(updated));
    setAttendances(updated);

    setNewDay("");
    setNewAttend("");
    setNewLeave("");
    setShowAddDay(false);
  };

  /* ---------- Monthly totals ---------- */

  // Filter attendances for the currently selected calendar month
  const filteredAttendances = attendances.filter((a) => {
    if (!a.attend) return false;
    const d = parseLocal(a.attend);
    return (
      d.getFullYear() === calendarMonth.year &&
      d.getMonth() + 1 === calendarMonth.month
    );
  });

  const totalHoursMonth = filteredAttendances
    .map((a) => calculateHours(a.attend, a.leave))
    .reduce((s, h) => s + h, 0);
  const totalOvertimeMonth = filteredAttendances
    .map((a) => calculateHours(a.attend, a.leave) - shiftHours)
    .filter((x) => x > 0)
    .reduce((s, h) => s + h, 0);

  /* ---------- Manual fix script ---------- */
  // Fix rows where leave exists but leave datetime <= attend datetime -> add 1 day to leave
  const runManualFix = () => {
    const updated = attendances.map((a) => {
      if (!a.attend || !a.leave) return a;
      const att = parseLocal(a.attend);
      let le = parseLocal(a.leave);
      if (le <= att) {
        // increment leave by 1 day
        const fixed = new Date(le);
        fixed.setDate(fixed.getDate() + 1);
        return { ...a, leave: localDatetimeString(fixed) };
      }
      return a;
    });

    // count changes
    let changed = 0;
    for (let i = 0; i < attendances.length; i++) {
      if (
        attendances[i].leave &&
        parseLocal(attendances[i].leave) <= parseLocal(attendances[i].attend)
      ) {
        changed++;
      }
    }

    if (changed === 0) {
      alert("No problematic rows found.");
      return;
    }

    localStorage.setItem("attendance", JSON.stringify(updated));
    setAttendances(updated);
    alert(`Fixed ${changed} rows (leave moved to next day).`);
  };

  /* ---------- Monthly calendar preview data ---------- */
  const monthPreview = () => {
    const { year, month } = calendarMonth;
    // produce array of days for the month
    const daysInMonth = new Date(year, month, 0).getDate();
    // find the latest recorded datetime in attendances (attend field preferred, fallback to day)
    let maxRecorded = null;
    for (const a of attendances) {
      let d = null;
      if (a.attend) d = parseLocal(a.attend);
      else if (a.day) d = new Date(a.day);
      if (d && (!maxRecorded || d > maxRecorded)) maxRecorded = d;
    }

    const arr = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(
        d,
      ).padStart(2, "0")}`;
      const dayKey = new Date(dateStr).toDateString();
      const rec = attendances.find((a) => a.day === dayKey);
      arr.push({ dateStr, dayKey, rec, maxRecorded });
    }
    return arr;
  };

  const preview = monthPreview();

  /* ---------- Render ---------- */

  return (
    <div className="p-4">
      <h2 className="font-bold text-2xl mb-4">Attendance</h2>
      {/* User input for PDF header */}
      <div className="mb-4">
        {user ? (
          <div className="flex items-center gap-3">
            <span className="font-semibold">User: {user}</span>
            <button
              className="px-2 py-1 bg-gray-300 rounded"
              onClick={() => {
                // enable editing: populate input with current name and switch to edit mode
                setUserInput(user || "");
                setUser("");
              }}
            >
              Edit
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <input
              className="border p-1 rounded"
              placeholder="Enter name for export"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
            />
            <button
              className="px-3 py-1 bg-blue-600 text-white rounded"
              onClick={() => {
                const trimmed = (userInput || "").trim();
                // allow empty (no user stored)
                if (!trimmed) {
                  setUser("");
                  setUserInput("");
                  localStorage.removeItem("attendanceUser");
                  return;
                }

                // Validate: English letters and spaces only, length 3-20
                const valid = /^[A-Za-z ]{3,20}$/.test(trimmed);
                if (!valid) {
                  alert(
                    "Name must be 3–20 characters and contain only English letters and spaces (no numbers or symbols).",
                  );
                  return;
                }

                setUser(trimmed);
                setUserInput(trimmed);
                localStorage.setItem("attendanceUser", trimmed);
              }}
            >
              Save
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-2 mb-4">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded"
          onClick={handleAttend}
        >
          Attend
        </button>

        <button
          className="px-4 py-2 bg-yellow-600 text-white rounded"
          onClick={runManualFix}
        >
          Run Manual Fix (overnight leaves)
        </button>
      </div>

      {/* Month selector for filtering the main table and preview */}
      <div className="flex gap-2 items-center mb-4">
        <label className="font-semibold">Month:</label>
        <select
          value={`${calendarMonth.year}-${String(calendarMonth.month).padStart(
            2,
            "0",
          )}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-").map(Number);
            setCalendarMonth({ year: y, month: m });
          }}
          className="border p-1 rounded"
        >
          {/* last 6 months */}
          {Array.from({ length: 6 }).map((_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const y = d.getFullYear();
            const m = d.getMonth() + 1;
            return (
              <option
                key={`${y}-${m}`}
                value={`${y}-${String(m).padStart(2, "0")}`}
              >
                {d.toLocaleString("en-GB", { month: "long" })} {y}
              </option>
            );
          })}
        </select>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <table className="w-full border mt-2">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 border">Day</th>
                <th className="p-2 border">Attend</th>
                <th className="p-2 border">Leave</th>
                <th className="p-2 border">Hours</th>
                <th className="p-2 border">Overtime</th>
                <th className="p-2 border">Edit</th>
                <th className="p-2 border">Delete</th>
              </tr>
            </thead>

            <tbody>
              {filteredAttendances
                .slice()
                .sort((a, b) => parseLocal(b.attend) - parseLocal(a.attend))
                .map((a) => {
                  const hours = calculateHours(a.attend, a.leave);
                  return (
                    <tr key={a.id} className="text-center">
                      <td className="border p-2">{formatDateGB(a.attend)}</td>

                      <td className="border p-2">
                        {editing === a.id ? (
                          <input
                            type="time"
                            value={editAttend}
                            onChange={(e) => setEditAttend(e.target.value)}
                          />
                        ) : (
                          formatTime12(a.attend)
                        )}
                      </td>

                      <td className="border p-2">
                        {editing === a.id ? (
                          <input
                            type="time"
                            value={editLeave}
                            onChange={(e) => setEditLeave(e.target.value)}
                          />
                        ) : a.leave ? (
                          formatTime12(a.leave)
                        ) : (
                          <button
                            className="px-3 py-1 bg-red-500 text-white rounded"
                            onClick={() => handleLeave(a.id)}
                          >
                            Leave
                          </button>
                        )}
                      </td>

                      <td className="border p-2">
                        {Math.trunc(hours) +
                          ":" +
                          String(Math.round((hours % 1) * 60)).padStart(2, "0")}
                        h
                      </td>

                      <td className="border p-2">
                        {isOvertime(hours) ? (
                          <span className="text-green-600 font-bold">
                            +
                            {Math.trunc(hours - shiftHours) +
                              ":" +
                              String(
                                Math.round(((hours - shiftHours) % 1) * 60),
                              ).padStart(2, "0")}
                            h
                          </span>
                        ) : (
                          "--"
                        )}
                      </td>

                      <td className="border p-2">
                        {editing === a.id ? (
                          <div className="flex gap-2 justify-center">
                            <button
                              className="px-3 py-1 bg-green-600 text-white rounded"
                              onClick={() => saveEdit(a.id)}
                            >
                              Save
                            </button>
                            <button
                              className="px-3 py-1 bg-gray-500 text-white rounded"
                              onClick={() => setEditing(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="px-3 py-1 bg-gray-600 text-white rounded"
                            onClick={() => startEdit(a)}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                      <td className="border p-2">
                        <button
                          className="px-3 py-1 bg-red-600 text-white rounded"
                          onClick={() => deleteRecord(a.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </>
      )}

      {/* Add Day UI */}
      <div className="mt-4">
        <button
          className="px-4 py-2 bg-purple-600 text-white rounded mb-3"
          onClick={() => setShowAddDay(true)}
        >
          Add Day
        </button>

        {showAddDay && (
          <div className="p-4 mb-4 border rounded bg-white shadow">
            <h3 className="font-bold text-lg mb-2">
              Add New Day (past 30 days only)
            </h3>

            <div className="mb-2">
              <label className="font-bold block">Date:</label>
              <input
                type="date"
                className="border p-2 rounded w-full"
                value={newDay}
                onChange={(e) => setNewDay(e.target.value)}
              />
            </div>

            <div className="mb-2">
              <label className="font-bold block">Attend Time:</label>
              <input
                type="time"
                className="border p-2 rounded w-full"
                value={newAttend}
                onChange={(e) => setNewAttend(e.target.value)}
              />
            </div>

            <div className="mb-2">
              <label className="font-bold block">Leave Time:</label>
              <input
                type="time"
                className="border p-2 rounded w-full"
                value={newLeave}
                onChange={(e) => setNewLeave(e.target.value)}
              />
            </div>

            <div className="flex gap-3 mt-3">
              <button
                className="px-4 py-2 bg-green-600 text-white rounded"
                onClick={handleAddManualDay}
              >
                Save
              </button>

              <button
                className="px-4 py-2 bg-gray-500 text-white rounded"
                onClick={() => setShowAddDay(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Totals + Manual Fix button placed above totals */}
      <div className="mt-4 p-3 bg-gray-100 rounded">
        <p>
          <strong>Total Hours:</strong>{" "}
          {Math.trunc(totalHoursMonth) +
            ":" +
            String(Math.round((totalHoursMonth % 1) * 60)).padStart(2, "0")}
          h
        </p>
        <p>
          <strong>Total Overtime:</strong>{" "}
          {Math.trunc(totalOvertimeMonth) +
            ":" +
            String(Math.round((totalOvertimeMonth % 1) * 60)).padStart(2, "0")}
          h
        </p>
      </div>

      {/* Monthly calendar preview */}
      <div className="mt-6 p-4 bg-white border rounded shadow w-full">
        <h3 className="font-bold mb-2">Monthly Preview</h3>

        <div className="grid grid-cols-5 md:grid-cols-7 gap-1 md:gap-2 text-center w-full">
          {preview.map((p) => (
            <div
              key={p.dayKey}
              className="p-1 md:p-2 border rounded min-w-fit text-center"
            >
              <div className="font-semibold">
                {new Date(p.dateStr).getDate()}
              </div>

              {p.rec ? (
                <div className="w-fit">
                  <div className="text-xs border-b-2">
                    {formatTime12(p.rec.attend)}
                  </div>
                  <div className="text-xs">
                    {p.rec.leave ? formatTime12(p.rec.leave) : "--"}
                  </div>
                </div>
              ) : // if no record AND the day is before the latest recorded day -> treat as holiday (visual only)
              p.maxRecorded && new Date(p.dateStr) < new Date(p.maxRecorded) ? (
                <div className="text-xs text-red-600 font-semibold">
                  Holiday
                </div>
              ) : (
                <div className="text-xs text-gray-400">—</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <ExcelExport attendances={attendances} user={user} />
    </div>
  );
}

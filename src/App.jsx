import { useEffect, useState } from "react";
import ExcelExport from "./ExcelExport"; // adjust the path if needed

export default function Attendance() {
  const [attendances, setAttendances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editAttend, setEditAttend] = useState("");
  const [editLeave, setEditLeave] = useState("");

  // ---- Helpers ----
  const formatTime = (str) => {
    if (!str) return "";
    const d = new Date(str.replace(" ", "T"));
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (str) => {
    const d = new Date(str.replace(" ", "T"));
    return d.toLocaleDateString("en-GB");
  };

  const calculateHours = (attend, leave) => {
    if (!attend || !leave) return 0;
    const start = new Date(attend.replace(" ", "T"));
    const end = new Date(leave.replace(" ", "T"));
    const diff = (end - start) / (1000 * 60 * 60);
    return diff > 0 ? diff : 0;
  };

  const shiftHours = 8;
  const isOvertime = (h) => h > shiftHours;

  // ---- Load ----
  useEffect(() => {
    loadAttendance();
  }, []);

  const loadAttendance = () => {
    setLoading(true);
    const stored = JSON.parse(localStorage.getItem("attendance") || "[]");
    setAttendances(stored);
    setLoading(false);
  };

  // Utility to build local "YYYY-MM-DD HH:MM"
  const localDatetimeString = (dateObj) => {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    const hh = String(dateObj.getHours()).padStart(2, "0");
    const min = String(dateObj.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  };

  // ---- Attend ----
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

  // ---- Leave ----
  const handleLeave = (id) => {
    const now = new Date();
    const updated = attendances.map((a) =>
      a.id === id ? { ...a, leave: localDatetimeString(now) } : a
    );

    localStorage.setItem("attendance", JSON.stringify(updated));
    setAttendances(updated);
  };

  // ---- Edit ----
  const startEdit = (record) => {
    setEditing(record.id);

    const attend = record.attend
      ? new Date(record.attend.replace(" ", "T"))
      : null;

    const leave = record.leave
      ? new Date(record.leave.replace(" ", "T"))
      : null;

    setEditAttend(
      attend
        ? `${String(attend.getHours()).padStart(2, "0")}:${String(
            attend.getMinutes()
          ).padStart(2, "0")}`
        : ""
    );

    setEditLeave(
      leave
        ? `${String(leave.getHours()).padStart(2, "0")}:${String(
            leave.getMinutes()
          ).padStart(2, "0")}`
        : ""
    );
  };

  const saveEdit = (id) => {
    let updated = attendances.map((a) => {
      if (a.id !== id) return a;

      const attDate = new Date(a.attend.replace(" ", "T"));
      const leaveDate = a.leave ? new Date(a.leave.replace(" ", "T")) : null;

      let newAttend = a.attend;
      let newLeave = a.leave;

      if (editAttend) {
        const [hh, mm] = editAttend.split(":");
        attDate.setHours(hh);
        attDate.setMinutes(mm);
        newAttend = localDatetimeString(attDate);
      }

      if (editLeave && leaveDate) {
        const [hh, mm] = editLeave.split(":");
        leaveDate.setHours(hh);
        leaveDate.setMinutes(mm);
        newLeave = localDatetimeString(leaveDate);
      }

      return { ...a, attend: newAttend, leave: newLeave };
    });

    // --- AUTO GENERATE PREVIOUS DAY IF MISSING ---
    const editedRecord = updated.find((a) => a.id === id);
    const editedDate = new Date(editedRecord.attend.replace(" ", "T"));

    // previous day
    const prevDate = new Date(editedDate);
    prevDate.setDate(prevDate.getDate() - 1);

    const prevDayKey = prevDate.toDateString();

    const exists = updated.some((a) => a.day === prevDayKey);

    // Sort attendances by attend datetime descending (newest first)
    const sortedDesc = [...updated].sort(
      (a, b) =>
        new Date(b.attend.replace(" ", "T")) -
        new Date(a.attend.replace(" ", "T"))
    );

    // Get the "last" record in descending order (newest)
    const newestRecord = sortedDesc[sortedDesc.length - 1];

    // Only auto-generate previous day if edited record is NOT the newest
    if (editedRecord.id !== newestRecord.id && !exists) {
      const autoAttend =
        localDatetimeString(prevDate).split(" ")[0] + " " + editAttend;
      const autoLeave = localDatetimeString(prevDate).split(" ")[0] + " 00:00";

      const autoRecord = {
        id: Date.now() + 999, // unique ID
        day: prevDayKey,
        attend: autoAttend,
        leave: autoLeave,
      };

      updated = [...updated, autoRecord];
    }

    // Save
    localStorage.setItem("attendance", JSON.stringify(updated));
    setAttendances(updated);
    setEditing(null);
  };

  // ---- Monthly Totals ----
  const totalHoursMonth = attendances
    .map((a) => calculateHours(a.attend, a.leave))
    .reduce((s, h) => s + h, 0);

  const totalOvertimeMonth = attendances
    .map((a) => calculateHours(a.attend, a.leave) - shiftHours)
    .filter((x) => x > 0)
    .reduce((s, h) => s + h, 0);

  return (
    <div className="p-4">
      <h2 className="font-bold text-xl mb-4">Attendance</h2>

      <button
        className="px-4 py-2 bg-blue-600 text-white rounded mb-4"
        onClick={handleAttend}
      >
        Attend
      </button>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="w-full border mt-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">Day</th>
              <th className="p-2 border">Attend</th>
              <th className="p-2 border">Leave</th>
              <th className="p-2 border">Hours</th>
              <th className="p-2 border">Overtime</th>
              <th className="p-2 border">Edit</th>
            </tr>
          </thead>

          <tbody>
            {attendances
              .slice() // copy to avoid mutating state
              .sort(
                (a, b) =>
                  new Date(b.attend.replace(" ", "T")) -
                  new Date(a.attend.replace(" ", "T"))
              )
              .map((a) => {
                const hours = calculateHours(a.attend, a.leave);

                return (
                  <tr className="text-center" key={a.id}>
                    <td className="border p-2">{formatDate(a.attend)}</td>

                    {/* Attend */}
                    <td className="border p-2">
                      {editing === a.id ? (
                        <input
                          type="time"
                          value={editAttend}
                          onChange={(e) => setEditAttend(e.target.value)}
                        />
                      ) : (
                        formatTime(a.attend)
                      )}
                    </td>

                    {/* Leave */}
                    <td className="border p-2">
                      {editing === a.id ? (
                        <input
                          type="time"
                          value={editLeave}
                          onChange={(e) => setEditLeave(e.target.value)}
                        />
                      ) : a.leave ? (
                        formatTime(a.leave)
                      ) : (
                        <button
                          className="px-3 py-1 bg-red-500 text-white rounded"
                          onClick={() => handleLeave(a.id)}
                        >
                          Leave
                        </button>
                      )}
                    </td>

                    <td className="border p-2">{hours.toFixed(2)}h</td>

                    <td className="border p-2">
                      {isOvertime(hours) ? (
                        <span className="text-green-600 font-bold">
                          +{(hours - shiftHours).toFixed(2)}h
                        </span>
                      ) : (
                        "--"
                      )}
                    </td>

                    <td className="border p-2">
                      {editing === a.id ? (
                        <button
                          className="px-3 py-1 bg-green-600 text-white rounded"
                          onClick={() => saveEdit(a.id)}
                        >
                          Save
                        </button>
                      ) : (
                        <button
                          className="px-3 py-1 bg-gray-600 text-white rounded"
                          onClick={() => startEdit(a)}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      )}

      <div className="mt-4 p-3 bg-gray-100 rounded">
        <p>
          <strong>Total Hours:</strong> {totalHoursMonth.toFixed(2)}h
        </p>
        <p>
          <strong>Total Overtime:</strong> {totalOvertimeMonth.toFixed(2)}h
        </p>
      </div>

      <ExcelExport attendances={attendances} />
    </div>
  );
}

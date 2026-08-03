/**
 * Leave & Holiday Module
 * Shared logic for Week Off, Holiday, and Paid Leave support.
 * Used by both the employee dashboard (attendance.js) and the admin
 * dashboard (admin.js) so the attendance-priority rules stay identical
 * everywhere they're evaluated.
 */

// ===================================
// Config
// ===================================

// Date the attendance system went live. Dates before this are never counted
// as Present/Absent/Week Off/etc. in history views, since no attendance was
// being tracked yet.
const LAUNCH_DATE = '2026-08-01';

// Days of week that are automatically treated as Week Off.
// 0 = Sunday, 1 = Monday, ... 6 = Saturday. Currently: Sunday only.
const WEEK_OFF_DAYS = [0];

/**
 * Whether a given YYYY-MM-DD date string falls on a configured week-off day.
 * @param {string} dateStr
 * @returns {boolean}
 */
function isWeekOff(dateStr) {
    // Parse as a local date (avoid UTC shift issues with new Date('YYYY-MM-DD'))
    const [y, m, d] = dateStr.split('-').map(Number);
    const day = new Date(y, m - 1, d).getDay();
    return WEEK_OFF_DAYS.includes(day);
}

// ===================================
// Holidays
// ===================================

/**
 * Fetch all holidays between two YYYY-MM-DD dates (inclusive) as a Map keyed by date.
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<Map<string,object>>}
 */
async function getHolidaysInRange(startDate, endDate) {
    const db = window.firebaseDb;
    const map = new Map();
    try {
        const holidaysRef = collection(db, 'holidays');
        const q = query(holidaysRef, where('date', '>=', startDate), where('date', '<=', endDate));
        const snapshot = await getDocs(q);
        snapshot.forEach(docSnap => {
            map.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        });
    } catch (error) {
        console.error('Error loading holidays:', error);
    }
    return map;
}

/**
 * Fetch a single holiday for a specific date, or null.
 * @param {string} dateStr
 */
async function getHoliday(dateStr) {
    const db = window.firebaseDb;
    try {
        const holidayDoc = await getDoc(doc(db, 'holidays', dateStr));
        return holidayDoc.exists() ? { id: holidayDoc.id, ...holidayDoc.data() } : null;
    } catch (error) {
        console.error('Error loading holiday:', error);
        return null;
    }
}

/**
 * Fetch every holiday on record, sorted by date ascending.
 */
async function getAllHolidays() {
    const db = window.firebaseDb;
    try {
        const holidaysRef = collection(db, 'holidays');
        const q = query(holidaysRef, orderBy('date', 'asc'));
        const snapshot = await getDocs(q);
        const holidays = [];
        snapshot.forEach(docSnap => holidays.push({ id: docSnap.id, ...docSnap.data() }));
        return holidays;
    } catch (error) {
        console.error('Error loading holidays list:', error);
        return [];
    }
}

/**
 * Create or overwrite a holiday for a date.
 * @param {string} dateStr - YYYY-MM-DD, used as the document ID
 * @param {string} name - Holiday name/description
 */
async function saveHoliday(dateStr, name) {
    const db = window.firebaseDb;
    const auth = window.firebaseAuth;
    await setDoc(doc(db, 'holidays', dateStr), {
        date: dateStr,
        name: name,
        updatedAt: Timestamp.now(),
        updatedBy: auth.currentUser ? auth.currentUser.uid : null
    }, { merge: true });
}

/**
 * Delete a holiday by date.
 * @param {string} dateStr
 */
async function deleteHoliday(dateStr) {
    const db = window.firebaseDb;
    await deleteDoc(doc(db, 'holidays', dateStr));
}

// ===================================
// Paid Leave
// ===================================

/**
 * Fetch APPROVED paid leaves for one employee between two dates as a Map keyed by date.
 * @param {string} userId
 * @param {string} startDate
 * @param {string} endDate
 */
async function getApprovedLeavesInRange(userId, startDate, endDate) {
    const db = window.firebaseDb;
    const map = new Map();
    try {
        const leavesRef = collection(db, 'paidLeaves', userId, 'records');
        const q = query(
            leavesRef,
            where('date', '>=', startDate),
            where('date', '<=', endDate),
            where('status', '==', 'approved')
        );
        const snapshot = await getDocs(q);
        snapshot.forEach(docSnap => {
            map.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        });
    } catch (error) {
        console.error('Error loading paid leaves:', error);
    }
    return map;
}

/**
 * Fetch a single paid leave record for a user + date, or null.
 */
async function getPaidLeave(userId, dateStr) {
    const db = window.firebaseDb;
    try {
        const leaveDoc = await getDoc(doc(db, 'paidLeaves', userId, 'records', dateStr));
        return leaveDoc.exists() ? { id: leaveDoc.id, ...leaveDoc.data() } : null;
    } catch (error) {
        console.error('Error loading paid leave:', error);
        return null;
    }
}

/**
 * Employee: request a paid leave for a future/current date. Status starts as 'pending'
 * until an admin approves it.
 * @param {string} userId
 * @param {string} dateStr
 * @param {string} reason
 */
async function requestPaidLeave(userId, dateStr, reason) {
    const db = window.firebaseDb;
    const leaveRef = doc(db, 'paidLeaves', userId, 'records', dateStr);
    const existing = await getDoc(leaveRef);
    if (existing.exists() && existing.data().status !== 'rejected') {
        throw new Error('A leave request for this date already exists.');
    }
    await setDoc(leaveRef, {
        date: dateStr,
        reason: reason || '',
        status: 'pending',
        requestedAt: Timestamp.now(),
        decidedAt: null,
        decidedBy: null
    });
}

/**
 * Admin: approve or reject a pending paid leave request.
 * @param {string} userId
 * @param {string} dateStr
 * @param {'approved'|'rejected'} decision
 */
async function decidePaidLeave(userId, dateStr, decision) {
    const db = window.firebaseDb;
    const auth = window.firebaseAuth;
    const leaveRef = doc(db, 'paidLeaves', userId, 'records', dateStr);
    await updateDoc(leaveRef, {
        status: decision,
        decidedAt: Timestamp.now(),
        decidedBy: auth.currentUser ? auth.currentUser.uid : null
    });
}

/**
 * Admin: fetch all paid leave requests across all given employees (for the leave requests list).
 * @param {Array<{id:string,name:string}>} employees
 * @param {string|null} statusFilter - 'pending' | 'approved' | 'rejected' | null (all)
 */
async function getAllLeaveRequests(employees, statusFilter = null) {
    const db = window.firebaseDb;
    const results = [];
    for (const emp of employees) {
        try {
            const leavesRef = collection(db, 'paidLeaves', emp.id, 'records');
            const q = statusFilter
                ? query(leavesRef, where('status', '==', statusFilter))
                : query(leavesRef);
            const snapshot = await getDocs(q);
            snapshot.forEach(docSnap => {
                results.push({
                    ...docSnap.data(),
                    employeeId: emp.id,
                    employeeName: emp.name
                });
            });
        } catch (error) {
            console.error(`Error loading leave requests for ${emp.id}:`, error);
        }
    }
    // Most recently requested first
    results.sort((a, b) => (b.requestedAt?.toMillis?.() || 0) - (a.requestedAt?.toMillis?.() || 0));
    return results;
}

// ===================================
// Priority Resolution
// ===================================

/**
 * Resolve what should be displayed for a single date, following the priority:
 * Paid Leave > Holiday > Week Off > Attendance Record > Absent.
 *
 * @param {Object} params
 * @param {string} params.dateStr - YYYY-MM-DD
 * @param {Object|null} params.attendanceData - Firestore attendance record data, or null
 * @param {Object|null} params.holiday - Holiday record, or null
 * @param {Object|null} params.paidLeave - Approved paid leave record, or null
 * @param {boolean} [params.isFutureOrToday] - If true and no record exists, don't mark as Absent (e.g. today/future)
 * @returns {{status:string, statusLabel:string, statusClass:string, checkIn:string, checkOut:string, hours:string, hoursValue:number|null, lessOtCell:string, lessValue:number, overtimeValue:number, countsAsPresent:boolean}}
 */
function resolveDayStatus({ dateStr, attendanceData, holiday, paidLeave, isFutureOrToday = false }) {
    const NA = { checkIn: '--', checkOut: '--', hours: '--', hoursValue: null, lessOtCell: '<span class="text-muted">--</span>', lessValue: 0, overtimeValue: 0, countsAsPresent: false };

    if (paidLeave) {
        return { status: 'paid-leave', statusLabel: 'Paid Leave', statusClass: 'paid-leave', ...NA };
    }
    if (holiday) {
        return { status: 'holiday', statusLabel: 'Holiday', statusClass: 'holiday', ...NA };
    }
    if (isWeekOff(dateStr)) {
        return { status: 'week-off', statusLabel: 'Week Off', statusClass: 'week-off', ...NA };
    }
    if (attendanceData) {
        const STANDARD_HOURS = 8;
        const checkIn = attendanceData.checkIn ? formatTime(attendanceData.checkIn.toDate()) : '--:--';
        const checkOut = attendanceData.checkOut ? formatTime(attendanceData.checkOut.toDate()) : '--:--';
        const isPresent = attendanceData.status === 'present';
        const hoursValue = isPresent ? (attendanceData.totalHours || 0) : null;
        const hours = hoursValue !== null ? `${hoursValue.toFixed(2)}h` : '--';

        let lessOtCell = '<span class="text-muted">--</span>';
        let lessValue = 0;
        let overtimeValue = 0;
        if (isPresent && hoursValue !== null) {
            const diff = hoursValue - STANDARD_HOURS;
            if (diff < 0) {
                lessValue = Math.abs(diff);
                lessOtCell = `<span class="hour-badge less"><i class="fas fa-arrow-down"></i> ${lessValue.toFixed(2)}h</span>`;
            } else if (diff > 0) {
                overtimeValue = diff;
                lessOtCell = `<span class="hour-badge overtime"><i class="fas fa-arrow-up"></i> ${overtimeValue.toFixed(2)}h</span>`;
            } else {
                lessOtCell = `<span class="hour-badge exact"><i class="fas fa-check"></i> On time</span>`;
            }
        }

        const statusClass = isPresent ? 'present' : 'incomplete';
        const statusLabel = isPresent ? 'Present' : 'Incomplete';

        return {
            status: isPresent ? 'present' : 'incomplete',
            statusLabel, statusClass,
            checkIn, checkOut, hours, hoursValue, lessOtCell, lessValue, overtimeValue,
            countsAsPresent: isPresent
        };
    }
    if (isFutureOrToday) {
        return { status: 'not-marked', statusLabel: 'Not Checked In', statusClass: '', ...NA };
    }
    return { status: 'absent', statusLabel: 'Absent', statusClass: 'absent', ...NA };
}

/**
 * Build an array of YYYY-MM-DD strings for every day in a month.
 * @param {number} year
 * @param {number} month - 0-indexed
 */
function getDaysInMonth(year, month) {
    const days = [];
    const lastDay = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
        const dt = new Date(year, month, d);
        days.push(dt.toISOString().split('T')[0]);
    }
    return days;
}

// Make functions globally available (same pattern as the other modules)
window.LAUNCH_DATE = LAUNCH_DATE;
window.WEEK_OFF_DAYS = WEEK_OFF_DAYS;
window.isWeekOff = isWeekOff;
window.getHolidaysInRange = getHolidaysInRange;
window.getHoliday = getHoliday;
window.getAllHolidays = getAllHolidays;
window.saveHoliday = saveHoliday;
window.deleteHoliday = deleteHoliday;
window.getApprovedLeavesInRange = getApprovedLeavesInRange;
window.getPaidLeave = getPaidLeave;
window.requestPaidLeave = requestPaidLeave;
window.decidePaidLeave = decidePaidLeave;
window.getAllLeaveRequests = getAllLeaveRequests;
window.resolveDayStatus = resolveDayStatus;
window.getDaysInMonth = getDaysInMonth;

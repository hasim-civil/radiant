/**
 * Employee Attendance Module
 * Handles check-in, check-out, and attendance history for employees
 */

// ===================================
// Late Arrival Configuration
// ===================================

// Check-ins at or after this time are considered "late".
const LATE_CUTOFF_HOUR = 11;
const LATE_CUTOFF_MIN = 1; // 11:01 AM

// ===================================
// Attendance History List — state
// ===================================

// Resolved records for the currently-loaded month, most-recent first.
// Kept in memory so search/filter chip changes can re-render instantly
// without refetching from Firestore.
let monthlyAttendanceRecords = [];
let attendanceSearchQuery = '';
let attendanceStatusFilter = 'all';

/**
 * Determine whether a given check-in Date counts as a late arrival.
 * Cutoff: 11:01 AM or later is late; before that is on time.
 */
function isLateCheckIn(checkInDate) {
    if (!checkInDate) return false;
    const h = checkInDate.getHours();
    const m = checkInDate.getMinutes();
    return (h > LATE_CUTOFF_HOUR) || (h === LATE_CUTOFF_HOUR && m >= LATE_CUTOFF_MIN);
}

// ===================================
// Dashboard Initialization
// ===================================

/**
 * Initialize the employee dashboard
 */
async function initDashboard() {
    // Check authentication
    const auth = window.firebaseAuth;
    
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        
        const userData = await getUserData(user.uid);
        
        if (!userData) {
            showToast('User data not found', 'error');
            await logoutUser();
            return;
        }
        
        // Redirect admin to admin dashboard
        if (userData.role === 'admin') {
            window.location.href = 'admin.html';
            return;
        }
        
        // Store user data
        sessionStorage.setItem('currentUser', JSON.stringify(userData));
        
        // Initialize dashboard components
        setupDashboard(userData);
        hideLoading();
    });
}

/**
 * Setup dashboard components
 * @param {Object} userData - Current user data
 */
function setupDashboard(userData) {
    // Set user name
    document.getElementById('userName').textContent = userData.name;
    
    // Set current date
    const today = new Date();
    document.getElementById('currentDate').textContent = formatDate(today);
    document.getElementById('todayDate').textContent = formatDate(today);
    
    // Start live clock
    updateClock();
    setInterval(updateClock, 1000);
    
    // Setup navigation
    setupNavigation();
    
    // Setup sidebar toggle
    setupSidebar();
    
    // Setup logout button
    document.getElementById('logoutBtn').addEventListener('click', logoutUser);
    
    // Setup check-in/out buttons
    setupAttendanceButtons();
    
    // Setup month/year filters
    setupFilters();
    
    // Load initial data
    loadTodayAttendance();
    loadAttendanceStats();
    loadRecentAttendance();
    loadProfile(userData);
}

/**
 * Update live clock display
 */
function updateClock() {
    const clock = document.getElementById('liveClock');
    if (clock) {
        const now = new Date();
        clock.textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    }
}

/**
 * Setup navigation between sections
 */
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            const sectionId = item.dataset.section;
            
            // Update active nav item
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Show corresponding section
            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === `${sectionId}Section`) {
                    section.classList.add('active');
                }
            });
            
            // Close mobile sidebar
            document.getElementById('sidebar').classList.remove('mobile-open');
            
            // Load section-specific data
            if (sectionId === 'attendance') {
                loadMonthlyAttendance();
            }
        });
    });
}

/**
 * Setup sidebar toggle functionality
 */
function setupSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    
    // Desktop toggle
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
    
    // Mobile toggle
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
        });
    }
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
                sidebar.classList.remove('mobile-open');
            }
        }
    });
}

/**
 * Setup month and year filter dropdowns
 */
function setupFilters() {
    const monthFilter = document.getElementById('monthFilter');
    const yearFilter = document.getElementById('yearFilter');
    
    // Set current month
    const today = new Date();
    monthFilter.value = today.getMonth();
    
    // Populate year dropdown (from launch year to current year - no history before launch)
    const currentYear = today.getFullYear();
    const launchYear = parseInt(LAUNCH_DATE.split('-')[0]);
    for (let year = currentYear; year >= launchYear; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    }
    
    // Add change listeners
    monthFilter.addEventListener('change', loadMonthlyAttendance);
    yearFilter.addEventListener('change', loadMonthlyAttendance);

    // Search box: filters the already-loaded records, no refetch needed
    const searchInput = document.getElementById('attendanceSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            attendanceSearchQuery = e.target.value;
            renderAttendanceRecordList();
        });
    }

    // Status filter chips
    const chipsContainer = document.getElementById('attendanceFilterChips');
    if (chipsContainer) {
        chipsContainer.addEventListener('click', (e) => {
            const chip = e.target.closest('.filter-chip');
            if (!chip) return;
            chipsContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            attendanceStatusFilter = chip.dataset.status || 'all';
            renderAttendanceRecordList();
        });
    }
}

// ===================================
// Attendance Functions
// ===================================

/**
 * Setup check-in and check-out buttons
 */
function setupAttendanceButtons() {
    const checkInBtn = document.getElementById('checkInBtn');
    const checkOutBtn = document.getElementById('checkOutBtn');
    const editTimeBtn = document.getElementById('editTimeBtn');
    const addPastAttendanceBtn = document.getElementById('addPastAttendanceBtn');

    checkInBtn.addEventListener('click', handleCheckIn);
    checkOutBtn.addEventListener('click', handleCheckOut);
    editTimeBtn.addEventListener('click', openEditTimeModal);
    addPastAttendanceBtn.addEventListener('click', openAddPastAttendanceModal);

    // Modal controls for Edit Time
    document.getElementById('closeEditModal').addEventListener('click', closeEditTimeModal);
    document.getElementById('cancelEditBtn').addEventListener('click', closeEditTimeModal);
    document.getElementById('saveEditTimeBtn').addEventListener('click', saveEditedTime);

    // Modal controls for Add Past Attendance
    document.getElementById('closeAddPastModal').addEventListener('click', closeAddPastAttendanceModal);
    document.getElementById('cancelAddPastBtn').addEventListener('click', closeAddPastAttendanceModal);
    document.getElementById('saveAddPastBtn').addEventListener('click', savePastAttendance);

    // AM/PM toggle buttons
    document.querySelectorAll('.ampm-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            document.querySelectorAll(`.ampm-btn[data-target="${target}"]`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Close modals on backdrop click
    document.getElementById('editTimeModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('editTimeModal')) closeEditTimeModal();
    });
    document.getElementById('addPastAttendanceModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('addPastAttendanceModal')) closeAddPastAttendanceModal();
    });

    // Set max date for past attendance date picker (yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    document.getElementById('pastAttendanceDate').max = toLocalDateString(yesterday);

    // Request Leave
    const requestLeaveBtn = document.getElementById('requestLeaveBtn');
    if (requestLeaveBtn) requestLeaveBtn.addEventListener('click', openRequestLeaveModal);

    const closeRequestLeaveModal = document.getElementById('closeRequestLeaveModal');
    const cancelRequestLeaveBtn = document.getElementById('cancelRequestLeaveBtn');
    if (closeRequestLeaveModal) closeRequestLeaveModal.addEventListener('click', closeRequestLeaveModalFn);
    if (cancelRequestLeaveBtn) cancelRequestLeaveBtn.addEventListener('click', closeRequestLeaveModalFn);

    const requestLeaveModal = document.getElementById('requestLeaveModal');
    if (requestLeaveModal) {
        requestLeaveModal.addEventListener('click', (e) => {
            if (e.target === requestLeaveModal) closeRequestLeaveModalFn();
        });
    }

    const requestLeaveForm = document.getElementById('requestLeaveForm');
    if (requestLeaveForm) requestLeaveForm.addEventListener('submit', handleRequestLeaveSubmit);
}

/**
 * Open the Request Leave modal
 */
function openRequestLeaveModal() {
    const form = document.getElementById('requestLeaveForm');
    if (form) form.reset();
    document.getElementById('leaveDate').min = getTodayDate();
    document.getElementById('requestLeaveModal').classList.add('active');
}

/**
 * Close the Request Leave modal
 */
function closeRequestLeaveModalFn() {
    document.getElementById('requestLeaveModal').classList.remove('active');
}

/**
 * Submit a paid leave request
 */
async function handleRequestLeaveSubmit(e) {
    e.preventDefault();

    const auth = window.firebaseAuth;
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const dateStr = document.getElementById('leaveDate').value;
    const reason = document.getElementById('leaveReason').value.trim();

    if (!dateStr) {
        showToast('Please select a date.', 'warning');
        return;
    }

    showLoading();
    try {
        await requestPaidLeave(currentUser.uid, dateStr, reason);
        hideLoading();
        closeRequestLeaveModalFn();
        showToast('Leave request submitted! Waiting for admin approval.', 'success');
    } catch (error) {
        hideLoading();
        console.error('Error requesting leave:', error);
        showToast(error.message || 'Failed to submit leave request.', 'error');
    }
}

/**
 * Open the Add Past Attendance modal
 */
function openAddPastAttendanceModal() {
    // Reset form
    document.getElementById('pastAttendanceDate').value = '';
    document.getElementById('pastCheckInHour').value = '9';
    document.getElementById('pastCheckInMin').value = '00';
    document.getElementById('pastCheckOutHour').value = '5';
    document.getElementById('pastCheckOutMin').value = '00';
    
    // Reset AM/PM buttons
    document.querySelectorAll('.ampm-btn[data-target="pastCheckIn"]').forEach(b => {
        b.classList.toggle('active', b.dataset.val === 'AM');
    });
    document.querySelectorAll('.ampm-btn[data-target="pastCheckOut"]').forEach(b => {
        b.classList.toggle('active', b.dataset.val === 'PM');
    });

    // Reset Work Location to the default (Office)
    const pastWorkLocation = document.getElementById('pastWorkLocation');
    if (pastWorkLocation) pastWorkLocation.value = 'office';

    document.getElementById('addPastAttendanceModal').classList.add('active');
}

/**
 * Close the Add Past Attendance modal
 */
function closeAddPastAttendanceModal() {
    document.getElementById('addPastAttendanceModal').classList.remove('active');
}

/**
 * Save past attendance record
 */
async function savePastAttendance() {
    const user = getCurrentUser();
    if (!user) return;

    const db = window.firebaseDb;
    const auth = window.firebaseAuth;
    const currentUser = auth.currentUser;

    // Get selected date
    const selectedDate = document.getElementById('pastAttendanceDate').value;
    if (!selectedDate) {
        showToast('Please select a date.', 'warning');
        return;
    }

    // Validate date is not in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    if (selected >= today) {
        showToast('Please select a past date.', 'warning');
        return;
    }

    // Build check-in time
    const checkInHour = parseInt(document.getElementById('pastCheckInHour').value);
    const checkInMin = parseInt(document.getElementById('pastCheckInMin').value);
    const checkInAmpm = document.querySelector('.ampm-btn[data-target="pastCheckIn"].active')?.dataset.val || 'AM';

    if (isNaN(checkInHour) || isNaN(checkInMin) || checkInHour < 1 || checkInHour > 12 || checkInMin < 0 || checkInMin > 59) {
        showToast('Please enter a valid Check In time.', 'warning');
        return;
    }

    // Build check-out time
    const checkOutHour = parseInt(document.getElementById('pastCheckOutHour').value);
    const checkOutMin = parseInt(document.getElementById('pastCheckOutMin').value);
    const checkOutAmpm = document.querySelector('.ampm-btn[data-target="pastCheckOut"].active')?.dataset.val || 'PM';

    if (isNaN(checkOutHour) || isNaN(checkOutMin) || checkOutHour < 1 || checkOutHour > 12 || checkOutMin < 0 || checkOutMin > 59) {
        showToast('Please enter a valid Check Out time.', 'warning');
        return;
    }

    // Convert to 24-hour format
    let checkInHour24 = checkInHour;
    if (checkInAmpm === 'AM' && checkInHour === 12) checkInHour24 = 0;
    if (checkInAmpm === 'PM' && checkInHour !== 12) checkInHour24 = checkInHour + 12;

    let checkOutHour24 = checkOutHour;
    if (checkOutAmpm === 'AM' && checkOutHour === 12) checkOutHour24 = 0;
    if (checkOutAmpm === 'PM' && checkOutHour !== 12) checkOutHour24 = checkOutHour + 12;

    // Create Date objects
    const checkInDate = new Date(selectedDate);
    checkInDate.setHours(checkInHour24, checkInMin, 0, 0);

    const checkOutDate = new Date(selectedDate);
    checkOutDate.setHours(checkOutHour24, checkOutMin, 0, 0);

    // Validate check-out is after check-in
    if (checkOutDate <= checkInDate) {
        showToast('Check Out time must be after Check In time.', 'warning');
        return;
    }

    showLoading();

    try {
        // Check if record already exists for this date
        const attendanceRef = doc(db, 'attendance', currentUser.uid, 'records', selectedDate);
        const attendanceDoc = await getDoc(attendanceRef);

        if (attendanceDoc.exists()) {
            hideLoading();
            showToast('Attendance record already exists for this date.', 'warning');
            return;
        }

        // Calculate total hours
        const diffMs = checkOutDate - checkInDate;
        const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;

        // Save the record
        await setDoc(attendanceRef, {
            checkIn: Timestamp.fromDate(checkInDate),
            checkOut: Timestamp.fromDate(checkOutDate),
            totalHours: totalHours,
            status: 'present',
            date: selectedDate,
            workLocation: document.getElementById('pastWorkLocation')?.value || 'office',
            isLate: isLateCheckIn(checkInDate)
        });

        hideLoading();
        closeAddPastAttendanceModal();
        showToast('Past attendance added successfully!', 'success');
        
        // Refresh displays
        loadAttendanceStats();
        loadRecentAttendance();

    } catch (error) {
        hideLoading();
        console.error('Add past attendance error:', error);
        showToast('Failed to add attendance. Please try again.', 'error');
    }
}

/**
 * Open the edit time modal and pre-fill current times
 */
function openEditTimeModal() {
    const checkInText = document.getElementById('checkInTime').textContent;
    const checkOutText = document.getElementById('checkOutTime').textContent;

    // Pre-fill check-in
    if (checkInText && checkInText !== '--:--') {
        fillTimePicker('checkIn', checkInText);
    }

    // Pre-fill check-out
    const checkOutGroup = document.getElementById('editCheckOutGroup');
    if (checkOutText && checkOutText !== '--:--') {
        fillTimePicker('checkOut', checkOutText);
        checkOutGroup.style.display = 'block';
    } else {
        checkOutGroup.style.display = 'none';
    }

    // Pre-fill Work Location (defaults to Office if the record has none set yet)
    const editWorkLocation = document.getElementById('editWorkLocation');
    if (editWorkLocation) {
        const currentLocation = document.getElementById('editTimeBtn')?.dataset.workLocation || 'office';
        editWorkLocation.value = currentLocation;
    }

    document.getElementById('editTimeModal').classList.add('active');
}

/**
 * Fill a time picker group from a formatted time string like "09:30 AM"
 */
function fillTimePicker(target, timeStr) {
    const parts = timeStr.trim().split(' ');
    const timeParts = parts[0].split(':');
    const ampm = parts[1] || 'AM';

    if (target === 'checkIn') {
        document.getElementById('editCheckInHour').value = parseInt(timeParts[0]);
        document.getElementById('editCheckInMin').value = timeParts[1];
    } else {
        document.getElementById('editCheckOutHour').value = parseInt(timeParts[0]);
        document.getElementById('editCheckOutMin').value = timeParts[1];
    }

    document.querySelectorAll(`.ampm-btn[data-target="${target}"]`).forEach(b => {
        b.classList.toggle('active', b.dataset.val === ampm);
    });
}

/**
 * Close the edit time modal
 */
function closeEditTimeModal() {
    document.getElementById('editTimeModal').classList.remove('active');
}

/**
 * Build a Date object from the time picker inputs for a given target (checkIn/checkOut)
 */
function buildDateFromPicker(target, baseDate) {
    let hour, min, ampm;
    if (target === 'checkIn') {
        hour = parseInt(document.getElementById('editCheckInHour').value);
        min = parseInt(document.getElementById('editCheckInMin').value);
        ampm = document.querySelector('.ampm-btn[data-target="checkIn"].active')?.dataset.val || 'AM';
    } else {
        hour = parseInt(document.getElementById('editCheckOutHour').value);
        min = parseInt(document.getElementById('editCheckOutMin').value);
        ampm = document.querySelector('.ampm-btn[data-target="checkOut"].active')?.dataset.val || 'PM';
    }

    if (isNaN(hour) || isNaN(min) || hour < 1 || hour > 12 || min < 0 || min > 59) return null;

    let hour24 = hour;
    if (ampm === 'AM' && hour === 12) hour24 = 0;
    if (ampm === 'PM' && hour !== 12) hour24 = hour + 12;

    const d = new Date(baseDate);
    d.setHours(hour24, min, 0, 0);
    return d;
}

/**
 * Save the edited check-in/out times to Firestore
 */
async function saveEditedTime() {
    const user = getCurrentUser();
    if (!user) return;

    const today = getTodayDate();
    const db = window.firebaseDb;
    const auth = window.firebaseAuth;
    const currentUser = auth.currentUser;

    const baseDate = new Date();
    const newCheckIn = buildDateFromPicker('checkIn', baseDate);
    if (!newCheckIn) {
        showToast('Please enter a valid Check In time.', 'warning');
        return;
    }

    showLoading();
    try {
        const attendanceRef = doc(db, 'attendance', currentUser.uid, 'records', today);
        const attendanceDoc = await getDoc(attendanceRef);

        const checkOutGroup = document.getElementById('editCheckOutGroup');
        const hasCheckOut = checkOutGroup.style.display !== 'none';
        let newCheckOut = null;
        let totalHours = null;
        let status = 'incomplete';

        if (hasCheckOut) {
            newCheckOut = buildDateFromPicker('checkOut', baseDate);
            if (!newCheckOut) {
                hideLoading();
                showToast('Please enter a valid Check Out time.', 'warning');
                return;
            }
            if (newCheckOut <= newCheckIn) {
                hideLoading();
                showToast('Check Out time must be after Check In time.', 'warning');
                return;
            }
            const diffMs = newCheckOut - newCheckIn;
            totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
            status = 'present';
        }

        const updateData = {
            checkIn: Timestamp.fromDate(newCheckIn),
            date: today,
            workLocation: document.getElementById('editWorkLocation')?.value || 'office',
            isLate: isLateCheckIn(newCheckIn)
        };
        if (newCheckOut) {
            updateData.checkOut = Timestamp.fromDate(newCheckOut);
            updateData.totalHours = totalHours;
            updateData.status = status;
        } else {
            updateData.checkOut = null;
            updateData.totalHours = null;
            updateData.status = 'incomplete';
        }

        if (attendanceDoc.exists()) {
            await updateDoc(attendanceRef, updateData);
        } else {
            await setDoc(attendanceRef, updateData);
        }

        hideLoading();
        closeEditTimeModal();
        showToast('Attendance time updated successfully!', 'success');
        loadTodayAttendance();
        loadAttendanceStats();
        loadRecentAttendance();

    } catch (error) {
        hideLoading();
        console.error('Edit time error:', error);
        showToast('Failed to update time. Please try again.', 'error');
    }
}

/**
 * Handle check-in action
 */
async function handleCheckIn() {
    const user = getCurrentUser();
    if (!user) return;
    
    const today = getTodayDate();
    const db = window.firebaseDb;
    const auth = window.firebaseAuth;
    const currentUser = auth.currentUser;
    
    showLoading();
    
    try {
        // Holiday and approved Paid Leave still block check-in (company-assigned
        // days off). Week Off (e.g. Sunday) no longer blocks it — an employee who
        // voluntarily works their weekly off day can check in/out normally and it
        // will be recorded and counted (e.g. as Present/Outstation) like any other day.
        const holidayToday = await getHoliday(today);
        if (holidayToday) {
            hideLoading();
            showToast('Today is a Holiday. Check-in is not required.', 'warning');
            return;
        }
        const leaveToday = await getPaidLeave(currentUser.uid, today);
        if (leaveToday && leaveToday.status === 'approved') {
            hideLoading();
            showToast('You are on approved Paid Leave today.', 'warning');
            return;
        }

        // Check if already checked in today
        const attendanceRef = doc(db, 'attendance', currentUser.uid, 'records', today);
        const attendanceDoc = await getDoc(attendanceRef);
        
        if (attendanceDoc.exists()) {
            hideLoading();
            showToast('You have already checked in today!', 'warning');
            return;
        }
        
        // Create check-in record
        const now = new Date();
        await setDoc(attendanceRef, {
            checkIn: Timestamp.fromDate(now),
            checkOut: null,
            totalHours: null,
            status: 'incomplete',
            date: today,
            workLocation: 'office',
            isLate: isLateCheckIn(now)
        });
        
        hideLoading();
        showToast('Checked in successfully!', 'success');
        
        // Refresh display
        loadTodayAttendance();
        loadAttendanceStats();
        loadRecentAttendance();
        
    } catch (error) {
        hideLoading();
        console.error('Check-in error:', error);
        showToast('Failed to check in. Please try again.', 'error');
    }
}

/**
 * Handle check-out action
 */
async function handleCheckOut() {
    const user = getCurrentUser();
    if (!user) return;
    
    const today = getTodayDate();
    const db = window.firebaseDb;
    const auth = window.firebaseAuth;
    const currentUser = auth.currentUser;
    
    showLoading();
    
    try {
        // Get today's attendance record
        const attendanceRef = doc(db, 'attendance', currentUser.uid, 'records', today);
        const attendanceDoc = await getDoc(attendanceRef);
        
        if (!attendanceDoc.exists()) {
            hideLoading();
            showToast('Please check in first!', 'warning');
            return;
        }
        
        const data = attendanceDoc.data();
        
        if (data.checkOut) {
            hideLoading();
            showToast('You have already checked out today!', 'warning');
            return;
        }
        
        // Calculate working hours
        const checkInTime = data.checkIn.toDate();
        const checkOutTime = new Date();
        const diffMs = checkOutTime - checkInTime;
        const diffHours = diffMs / (1000 * 60 * 60);
        const totalHours = Math.round(diffHours * 100) / 100;
        
        // Update record with check-out
        await updateDoc(attendanceRef, {
            checkOut: Timestamp.fromDate(checkOutTime),
            totalHours: totalHours,
            status: 'present'
        });
        
        hideLoading();
        showToast('Checked out successfully!', 'success');
        
        // Refresh display
        loadTodayAttendance();
        loadAttendanceStats();
        loadRecentAttendance();
        
    } catch (error) {
        hideLoading();
        console.error('Check-out error:', error);
        showToast('Failed to check out. Please try again.', 'error');
    }
}

/**
 * Load today's attendance status
 */
async function loadTodayAttendance() {
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;
    const currentUser = auth.currentUser;
    
    if (!currentUser) return;
    
    const today = getTodayDate();
    const checkInBtn = document.getElementById('checkInBtn');
    const checkOutBtn = document.getElementById('checkOutBtn');
    const checkInTime = document.getElementById('checkInTime');
    const checkOutTime = document.getElementById('checkOutTime');
    const workingHours = document.getElementById('workingHours');
    const todayStatus = document.getElementById('todayStatus');
    const editTimeBtn = document.getElementById('editTimeBtn');
    
    try {
        const attendanceRef = doc(db, 'attendance', currentUser.uid, 'records', today);
        const [attendanceDoc, holiday, paidLeave] = await Promise.all([
            getDoc(attendanceRef),
            getHoliday(today),
            getPaidLeave(currentUser.uid, today)
        ]);
        const attendanceData = attendanceDoc.exists() ? attendanceDoc.data() : null;

        const resolved = resolveDayStatus({
            dateStr: today,
            attendanceData,
            holiday,
            paidLeave: paidLeave && paidLeave.status === 'approved' ? paidLeave : null,
            isFutureOrToday: true
        });

        // Non-working day (Paid Leave / Holiday / Week Off): no check-in/out allowed
        if (['paid-leave', 'holiday', 'week-off'].includes(resolved.status)) {
            checkInTime.textContent = '--:--';
            checkOutTime.textContent = '--:--';
            workingHours.textContent = '--:--';
            todayStatus.textContent = resolved.statusLabel;
            todayStatus.className = `status-badge ${resolved.statusClass}`;
            const todayWorkLocationOff = document.getElementById('todayWorkLocation');
            if (todayWorkLocationOff) {
                todayWorkLocationOff.textContent = '--';
                todayWorkLocationOff.className = 'status-badge';
            }
            checkInBtn.disabled = true;
            checkOutBtn.disabled = true;
            if (editTimeBtn) editTimeBtn.style.display = 'none';
            return;
        }

        if (attendanceData) {
            // Update check-in time
            if (attendanceData.checkIn) {
                checkInTime.textContent = formatTime(attendanceData.checkIn.toDate());
                checkInBtn.disabled = true;
                checkOutBtn.disabled = false;
            }
            
            // Update check-out time
            if (attendanceData.checkOut) {
                checkOutTime.textContent = formatTime(attendanceData.checkOut.toDate());
                checkOutBtn.disabled = true;
            }
            
            // Update working hours
            if (attendanceData.totalHours !== null) {
                workingHours.textContent = formatHoursMinutes(attendanceData.totalHours);
            }
            
            // Update status badge (location-aware: Present/Outstation/WFH, or Incomplete)
            todayStatus.textContent = resolved.statusLabel;
            todayStatus.className = `status-badge ${resolved.statusClass}`;

            // Update Work Location row
            const todayWorkLocation = document.getElementById('todayWorkLocation');
            if (todayWorkLocation) {
                if (attendanceData.status === 'present') {
                    const meta = getWorkLocationMeta(attendanceData.workLocation);
                    todayWorkLocation.textContent = `${meta.icon} ${meta.label === 'Present' ? 'Office' : meta.label}`;
                    todayWorkLocation.className = `status-badge ${meta.badgeClass}`;
                } else {
                    todayWorkLocation.textContent = '--';
                    todayWorkLocation.className = 'status-badge';
                }
            }

            // Show Edit Time button once checked in
            if (editTimeBtn) {
                editTimeBtn.style.display = 'inline-flex';
                editTimeBtn.dataset.workLocation = attendanceData.workLocation || 'office';
            }
            
        } else {
            // Reset to default state
            checkInTime.textContent = '--:--';
            checkOutTime.textContent = '--:--';
            workingHours.textContent = '--:--';
            todayStatus.textContent = 'Not Checked In';
            todayStatus.className = 'status-badge';
            const todayWorkLocationEmpty = document.getElementById('todayWorkLocation');
            if (todayWorkLocationEmpty) {
                todayWorkLocationEmpty.textContent = '--';
                todayWorkLocationEmpty.className = 'status-badge';
            }
            checkInBtn.disabled = false;
            checkOutBtn.disabled = true;
            if (editTimeBtn) editTimeBtn.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error loading today attendance:', error);
    }
}

/**
 * Load attendance statistics
 */
async function loadAttendanceStats() {
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;
    const currentUser = auth.currentUser;
    
    if (!currentUser) return;
    
    try {
        // Get all attendance records for current month
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const firstDayStr = toLocalDateString(firstDay);
        
        const attendanceRef = collection(db, 'attendance', currentUser.uid, 'records');
        const q = query(attendanceRef, where('date', '>=', firstDayStr));
        const snapshot = await getDocs(q);
        
        let totalDays = 0;
        let totalHours = 0;
        let presentDays = 0;
        let lateDays = 0;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            totalDays++;
            if (data.status === 'present') {
                presentDays++;
                totalHours += data.totalHours || 0;
            }
            if (data.isLate) {
                lateDays++;
            }
        });
        
        const avgHours = presentDays > 0 ? totalHours / presentDays : 0;

        // Calculate less hours and overtime (8h standard)
        const STANDARD_HOURS = 8;
        let totalLess = 0;
        let totalOvertime = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.status === 'present' && data.totalHours !== null) {
                const diff = data.totalHours - STANDARD_HOURS;
                if (diff < 0) totalLess += Math.abs(diff);
                else totalOvertime += diff;
            }
        });

        // Update UI
        document.getElementById('totalDays').textContent = totalDays;
        document.getElementById('totalHours')?.setAttribute('data-value', formatHoursMinutes(totalHours)); // card removed from UI; value retained for avgHours calc
        document.getElementById('presentDays').textContent = presentDays;
        document.getElementById('avgHours').textContent = formatHoursMinutes(avgHours);
        document.getElementById('lessHours').textContent = formatHoursMinutes(totalLess);
        document.getElementById('overtimeHours').textContent = formatHoursMinutes(totalOvertime);
        const lateDaysEl = document.getElementById('lateDays');
        if (lateDaysEl) lateDaysEl.textContent = lateDays;
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

/**
 * Load recent attendance records
 */
async function loadRecentAttendance() {
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;
    const currentUser = auth.currentUser;
    
    if (!currentUser) return;
    
    const tableBody = document.getElementById('recentAttendanceTable');
    if (!tableBody) return; // Recent Attendance card removed from Overview

    try {
        // Build the last 7 calendar days (including today)
        const dateList = [];
        const cursor = new Date();
        for (let i = 0; i < 7; i++) {
            dateList.unshift(toLocalDateString(cursor));
            cursor.setDate(cursor.getDate() - 1);
        }
        const filteredDates = dateList.filter(d => d >= LAUNCH_DATE);
        if (filteredDates.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center">No attendance records found</td></tr>';
            return;
        }
        const startDate = filteredDates[0];
        const endDate = filteredDates[filteredDates.length - 1];
        const todayStr = getTodayDate();

        const attendanceRef = collection(db, 'attendance', currentUser.uid, 'records');
        const q = query(attendanceRef, where('date', '>=', startDate), where('date', '<=', endDate));
        const [snapshot, holidayMap, leaveMap] = await Promise.all([
            getDocs(q),
            getHolidaysInRange(startDate, endDate),
            getApprovedLeavesInRange(currentUser.uid, startDate, endDate)
        ]);
        const attendanceMap = new Map();
        snapshot.forEach(docSnap => attendanceMap.set(docSnap.id, docSnap.data()));

        let html = '';
        // Most recent first
        [...filteredDates].reverse().forEach(dateStr => {
            const date = new Date(dateStr);
            const resolved = resolveDayStatus({
                dateStr,
                attendanceData: attendanceMap.get(dateStr) || null,
                holiday: holidayMap.get(dateStr) || null,
                paidLeave: leaveMap.get(dateStr) || null,
                isFutureOrToday: dateStr === todayStr
            });

            html += `
                <tr>
                    <td>${date.toLocaleDateString()}</td>
                    <td>${resolved.checkIn}</td>
                    <td>${resolved.checkOut}</td>
                    <td>${resolved.hours}</td>
                    <td><span class="status-badge ${resolved.statusClass}">${resolved.statusLabel}</span></td>
                </tr>
            `;
        });
        
        tableBody.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading recent attendance:', error);
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading data</td></tr>';
    }
}

/**
 * Render the attendance record card list from monthlyAttendanceRecords,
 * applying the current search query and status filter chip.
 */
function renderAttendanceRecordList() {
    const listEl = document.getElementById('monthlyAttendanceList');
    if (!listEl) return;

    const q = attendanceSearchQuery.trim().toLowerCase();

    const filtered = monthlyAttendanceRecords.filter(rec => {
        if (attendanceStatusFilter !== 'all' && rec.resolved.status !== attendanceStatusFilter) {
            return false;
        }
        if (!q) return true;
        const haystack = [
            rec.date.toLocaleDateString(),
            rec.dayName,
            rec.resolved.statusLabel,
            rec.resolved.status
        ].join(' ').toLowerCase();
        return haystack.includes(q);
    });

    if (filtered.length === 0) {
        listEl.innerHTML = '<div class="attendance-list-empty">No matching attendance records</div>';
        return;
    }

    const html = filtered.map(rec => {
        const { date, dayName, resolved } = rec;
        const monthShort = date.toLocaleDateString('en-US', { month: 'short' });
        const dayNum = date.getDate();
        const dayShort = dayName.slice(0, 3);

        return `
            <div class="attendance-record-card">
                <div class="attendance-record-date">
                    <span class="rec-day-num">${monthShort} ${dayNum}</span>
                    <span class="rec-weekday">${dayShort}</span>
                </div>
                <div class="attendance-record-times">
                    <span>${resolved.checkIn}</span>
                    <i class="fas fa-arrow-right"></i>
                    <span>${resolved.checkOut}</span>
                    ${resolved.hours && resolved.hours !== '--' ? `<span class="attendance-record-hours">${resolved.hours}</span>` : ''}
                </div>
                <span class="status-badge ${resolved.statusClass}">${resolved.statusLabel}</span>
            </div>
        `;
    }).join('');

    listEl.innerHTML = html;
}

/**
 * Load monthly attendance records
 */
async function loadMonthlyAttendance() {
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;
    const currentUser = auth.currentUser;
    
    if (!currentUser) return;
    
    const month = parseInt(document.getElementById('monthFilter').value);
    const year = parseInt(document.getElementById('yearFilter').value);
    
    const listEl = document.getElementById('monthlyAttendanceList');
    
    // Calculate date range
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDayStr = toLocalDateString(firstDay);
    const lastDayStr = toLocalDateString(lastDay);
    const todayStr = getTodayDate();
    
    try {
        const attendanceRef = collection(db, 'attendance', currentUser.uid, 'records');
        const q = query(
            attendanceRef, 
            where('date', '>=', firstDayStr),
            where('date', '<=', lastDayStr)
        );
        const [snapshot, holidayMap, leaveMap] = await Promise.all([
            getDocs(q),
            getHolidaysInRange(firstDayStr, lastDayStr),
            getApprovedLeavesInRange(currentUser.uid, firstDayStr, lastDayStr)
        ]);
        const attendanceMap = new Map();
        snapshot.forEach(docSnap => attendanceMap.set(docSnap.id, docSnap.data()));

        // Every day in the month, from launch date up to today (future days
        // aren't history yet, and nothing before launch was ever tracked)
        const dateList = getDaysInMonth(year, month).filter(d => d >= LAUNCH_DATE && d <= todayStr);

        if (dateList.length === 0) {
            monthlyAttendanceRecords = [];
            listEl.innerHTML = '<div class="attendance-list-empty">No attendance records for this month</div>';
            document.getElementById('monthlyPresent').textContent = '0';
            document.getElementById('monthlyWeekOff').textContent = '0';
            document.getElementById('monthlyHoliday').textContent = '0';
            document.getElementById('monthlyPaidLeave').textContent = '0';
            document.getElementById('monthlyAbsent').textContent = '0';
            document.getElementById('monthlyHours').textContent = '0h';
            document.getElementById('monthlyAvg').textContent = '0h';
            document.getElementById('monthlyLessHours').textContent = '0h';
            document.getElementById('monthlyOvertime').textContent = '0h';
            return;
        }
        
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        let totalPresent = 0, weekOffCount = 0, holidayCount = 0, paidLeaveCount = 0, absentCount = 0;
        let totalHours = 0, monthlyLess = 0, monthlyOvertime = 0;

        const records = [];

        // Most recent first
        [...dateList].reverse().forEach(dateStr => {
            const date = new Date(dateStr);
            const dayName = days[date.getDay()];

            const resolved = resolveDayStatus({
                dateStr,
                attendanceData: attendanceMap.get(dateStr) || null,
                holiday: holidayMap.get(dateStr) || null,
                paidLeave: leaveMap.get(dateStr) || null,
                isFutureOrToday: dateStr === todayStr
            });

            if (resolved.status === 'present') {
                totalPresent++;
                totalHours += resolved.hoursValue || 0;
                monthlyLess += resolved.lessValue;
                monthlyOvertime += resolved.overtimeValue;
            } else if (resolved.status === 'week-off') {
                weekOffCount++;
            } else if (resolved.status === 'holiday') {
                holidayCount++;
            } else if (resolved.status === 'paid-leave') {
                paidLeaveCount++;
            } else if (resolved.status === 'absent') {
                absentCount++;
            }

            records.push({ dateStr, date, dayName, resolved });
        });

        monthlyAttendanceRecords = records;
        renderAttendanceRecordList();
        
        // Update summary
        const avgHours = totalPresent > 0 ? totalHours / totalPresent : 0;
        document.getElementById('monthlyPresent').textContent = totalPresent;
        document.getElementById('monthlyWeekOff').textContent = weekOffCount;
        document.getElementById('monthlyHoliday').textContent = holidayCount;
        document.getElementById('monthlyPaidLeave').textContent = paidLeaveCount;
        document.getElementById('monthlyAbsent').textContent = absentCount;
        document.getElementById('monthlyHours').textContent = formatHoursMinutes(totalHours);
        document.getElementById('monthlyAvg').textContent = formatHoursMinutes(avgHours);
        document.getElementById('monthlyLessHours').textContent = formatHoursMinutes(monthlyLess);
        document.getElementById('monthlyOvertime').textContent = formatHoursMinutes(monthlyOvertime);
        
    } catch (error) {
        console.error('Error loading monthly attendance:', error);
        listEl.innerHTML = '<div class="attendance-list-empty">Error loading data</div>';
    }
}

/**
 * Load user profile information
 * @param {Object} userData - User data object
 */
function loadProfile(userData) {
    document.getElementById('profileName').textContent = userData.name;
    document.getElementById('profileEmail').textContent = userData.email;
    document.getElementById('profileRole').textContent = userData.role.charAt(0).toUpperCase() + userData.role.slice(1);
    
    if (userData.createdAt) {
        const joinDate = userData.createdAt.toDate();
        document.getElementById('profileJoined').textContent = joinDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } else {
        document.getElementById('profileJoined').textContent = 'N/A';
    }
}

// Make functions globally available
window.initDashboard = initDashboard;
window.setupDashboard = setupDashboard;

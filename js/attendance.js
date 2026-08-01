/**
 * Employee Attendance Module
 * Handles check-in, check-out, and attendance history for employees
 */

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
    
    // Populate year dropdown (last 3 years)
    const currentYear = today.getFullYear();
    for (let year = currentYear; year >= currentYear - 2; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    }
    
    // Add change listeners
    monthFilter.addEventListener('change', loadMonthlyAttendance);
    yearFilter.addEventListener('change', loadMonthlyAttendance);
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
    document.getElementById('pastAttendanceDate').max = yesterday.toISOString().split('T')[0];
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
            date: selectedDate
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
            date: today
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
            date: today
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
    
    try {
        const attendanceRef = doc(db, 'attendance', currentUser.uid, 'records', today);
        const attendanceDoc = await getDoc(attendanceRef);
        
        if (attendanceDoc.exists()) {
            const data = attendanceDoc.data();
            
            // Update check-in time
            if (data.checkIn) {
                checkInTime.textContent = formatTime(data.checkIn.toDate());
                checkInBtn.disabled = true;
                checkOutBtn.disabled = false;
            }
            
            // Update check-out time
            if (data.checkOut) {
                checkOutTime.textContent = formatTime(data.checkOut.toDate());
                checkOutBtn.disabled = true;
            }
            
            // Update working hours
            if (data.totalHours !== null) {
                workingHours.textContent = `${data.totalHours.toFixed(2)}h`;
            }
            
            // Update status badge
            todayStatus.textContent = data.status === 'present' ? 'Present' : 'Incomplete';
            todayStatus.className = `status-badge ${data.status}`;

            // Show Edit Time button once checked in
            const editTimeBtn = document.getElementById('editTimeBtn');
            if (editTimeBtn) editTimeBtn.style.display = 'inline-flex';
            
        } else {
            // Reset to default state
            checkInTime.textContent = '--:--';
            checkOutTime.textContent = '--:--';
            workingHours.textContent = '--:--';
            todayStatus.textContent = 'Not Checked In';
            todayStatus.className = 'status-badge';
            checkInBtn.disabled = false;
            checkOutBtn.disabled = true;
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
        const firstDayStr = firstDay.toISOString().split('T')[0];
        
        const attendanceRef = collection(db, 'attendance', currentUser.uid, 'records');
        const q = query(attendanceRef, where('date', '>=', firstDayStr));
        const snapshot = await getDocs(q);
        
        let totalDays = 0;
        let totalHours = 0;
        let presentDays = 0;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            totalDays++;
            if (data.status === 'present') {
                presentDays++;
                totalHours += data.totalHours || 0;
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
        document.getElementById('totalHours').textContent = `${totalHours.toFixed(1)}h`;
        document.getElementById('presentDays').textContent = presentDays;
        document.getElementById('avgHours').textContent = `${avgHours.toFixed(1)}h`;
        document.getElementById('lessHours').textContent = `${totalLess.toFixed(1)}h`;
        document.getElementById('overtimeHours').textContent = `${totalOvertime.toFixed(1)}h`;
        
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
    
    try {
        const attendanceRef = collection(db, 'attendance', currentUser.uid, 'records');
        const q = query(attendanceRef, orderBy('date', 'desc'), limit(7));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center">No attendance records found</td></tr>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const date = new Date(data.date);
            const checkIn = data.checkIn ? formatTime(data.checkIn.toDate()) : '--:--';
            const checkOut = data.checkOut ? formatTime(data.checkOut.toDate()) : '--:--';
            const hours = data.totalHours !== null ? `${data.totalHours.toFixed(2)}h` : '--';
            const statusClass = data.status === 'present' ? 'present' : 'incomplete';
            const statusText = data.status === 'present' ? 'Present' : 'Incomplete';
            
            html += `
                <tr>
                    <td>${date.toLocaleDateString()}</td>
                    <td>${checkIn}</td>
                    <td>${checkOut}</td>
                    <td>${hours}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
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
 * Load monthly attendance records
 */
async function loadMonthlyAttendance() {
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;
    const currentUser = auth.currentUser;
    
    if (!currentUser) return;
    
    const month = parseInt(document.getElementById('monthFilter').value);
    const year = parseInt(document.getElementById('yearFilter').value);
    
    const tableBody = document.getElementById('monthlyAttendanceTable');
    
    // Calculate date range
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDayStr = firstDay.toISOString().split('T')[0];
    const lastDayStr = lastDay.toISOString().split('T')[0];
    
    try {
        const attendanceRef = collection(db, 'attendance', currentUser.uid, 'records');
        const q = query(
            attendanceRef, 
            where('date', '>=', firstDayStr),
            where('date', '<=', lastDayStr),
            orderBy('date', 'desc')
        );
        const snapshot = await getDocs(q);
        
        let totalPresent = 0;
        let totalHours = 0;
        
        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No attendance records for this month</td></tr>';
            document.getElementById('monthlyPresent').textContent = '0';
            document.getElementById('monthlyHours').textContent = '0h';
            document.getElementById('monthlyAvg').textContent = '0h';
            return;
        }
        
        let html = '';
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const STANDARD_HOURS = 8;
        let monthlyLess = 0;
        let monthlyOvertime = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const date = new Date(data.date);
            const dayName = days[date.getDay()];
            const checkIn = data.checkIn ? formatTime(data.checkIn.toDate()) : '--:--';
            const checkOut = data.checkOut ? formatTime(data.checkOut.toDate()) : '--:--';
            const hours = data.totalHours !== null ? `${data.totalHours.toFixed(2)}h` : '--';
            const statusClass = data.status === 'present' ? 'present' : 'incomplete';
            const statusText = data.status === 'present' ? 'Present' : 'Incomplete';

            let lessOtCell = '<span class="text-muted">--</span>';
            if (data.status === 'present' && data.totalHours !== null) {
                totalPresent++;
                totalHours += data.totalHours || 0;
                const diff = data.totalHours - STANDARD_HOURS;
                if (diff < 0) {
                    monthlyLess += Math.abs(diff);
                    lessOtCell = `<span class="hour-badge less"><i class="fas fa-arrow-down"></i> ${Math.abs(diff).toFixed(2)}h</span>`;
                } else if (diff > 0) {
                    monthlyOvertime += diff;
                    lessOtCell = `<span class="hour-badge overtime"><i class="fas fa-arrow-up"></i> ${diff.toFixed(2)}h</span>`;
                } else {
                    lessOtCell = `<span class="hour-badge exact"><i class="fas fa-check"></i> On time</span>`;
                }
            } else if (data.status !== 'present') {
                // still count incomplete days for less hours
            }
            
            html += `
                <tr>
                    <td>${date.toLocaleDateString()}</td>
                    <td>${dayName}</td>
                    <td>${checkIn}</td>
                    <td>${checkOut}</td>
                    <td>${hours}</td>
                    <td>${lessOtCell}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                </tr>
            `;
        });
        
        tableBody.innerHTML = html;
        
        // Update summary
        const avgHours = totalPresent > 0 ? totalHours / totalPresent : 0;
        document.getElementById('monthlyPresent').textContent = totalPresent;
        document.getElementById('monthlyHours').textContent = `${totalHours.toFixed(1)}h`;
        document.getElementById('monthlyAvg').textContent = `${avgHours.toFixed(1)}h`;
        document.getElementById('monthlyLessHours').textContent = `${monthlyLess.toFixed(1)}h`;
        document.getElementById('monthlyOvertime').textContent = `${monthlyOvertime.toFixed(1)}h`;
        
    } catch (error) {
        console.error('Error loading monthly attendance:', error);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading data</td></tr>';
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

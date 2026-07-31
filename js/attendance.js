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
    
    // Setup theme toggle
    setupThemeToggle();
    
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
 * Setup theme toggle
 */
function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    body.className = savedTheme + '-mode';
    updateThemeIcon();
    
    themeToggle.addEventListener('click', () => {
        if (body.classList.contains('light-mode')) {
            body.classList.replace('light-mode', 'dark-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            body.classList.replace('dark-mode', 'light-mode');
            localStorage.setItem('theme', 'light');
        }
        updateThemeIcon();
    });
    
    function updateThemeIcon() {
        const icon = themeToggle.querySelector('i');
        const text = themeToggle.querySelector('span');
        if (body.classList.contains('dark-mode')) {
            icon.classList.replace('fa-moon', 'fa-sun');
            if (text) text.textContent = 'Light Mode';
        } else {
            icon.classList.replace('fa-sun', 'fa-moon');
            if (text) text.textContent = 'Dark Mode';
        }
    }
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
    
    checkInBtn.addEventListener('click', handleCheckIn);
    checkOutBtn.addEventListener('click', handleCheckOut);
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
        
        // Update UI
        document.getElementById('totalDays').textContent = totalDays;
        document.getElementById('totalHours').textContent = `${totalHours.toFixed(1)}h`;
        document.getElementById('presentDays').textContent = presentDays;
        document.getElementById('avgHours').textContent = `${avgHours.toFixed(1)}h`;
        
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
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const date = new Date(data.date);
            const dayName = days[date.getDay()];
            const checkIn = data.checkIn ? formatTime(data.checkIn.toDate()) : '--:--';
            const checkOut = data.checkOut ? formatTime(data.checkOut.toDate()) : '--:--';
            const hours = data.totalHours !== null ? `${data.totalHours.toFixed(2)}h` : '--';
            const statusClass = data.status === 'present' ? 'present' : 'incomplete';
            const statusText = data.status === 'present' ? 'Present' : 'Incomplete';
            
            if (data.status === 'present') {
                totalPresent++;
                totalHours += data.totalHours || 0;
            }
            
            html += `
                <tr>
                    <td>${date.toLocaleDateString()}</td>
                    <td>${dayName}</td>
                    <td>${checkIn}</td>
                    <td>${checkOut}</td>
                    <td>${hours}</td>
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

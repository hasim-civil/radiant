/**
 * Admin Dashboard Module
 * Handles employee management, attendance viewing, and reporting for admins
 */

// ===================================
// Admin Dashboard Initialization
// ===================================

/**
 * Initialize the admin dashboard
 */
async function initAdminDashboard() {
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
        
        // Redirect non-admin to employee dashboard
        if (userData.role !== 'admin') {
            window.location.href = 'dashboard.html';
            return;
        }
        
        // Store user data
        sessionStorage.setItem('currentUser', JSON.stringify(userData));
        
        // Initialize dashboard
        setupAdminDashboard(userData);
        hideLoading();
    });
}

/**
 * Setup admin dashboard components
 * @param {Object} userData - Current admin user data
 */
function setupAdminDashboard(userData) {
    // Set admin name
    document.getElementById('adminName').textContent = userData.name;
    
    // Set current date
    const today = new Date();
    document.getElementById('currentDate').textContent = formatDate(today);
    
    // Start live clock
    updateAdminClock();
    setInterval(updateAdminClock, 1000);
    
    // Setup navigation
    setupAdminNavigation();
    
    // Setup sidebar
    setupAdminSidebar();
    
    // Setup logout
    document.getElementById('logoutBtn').addEventListener('click', logoutUser);
    
    // Setup modals
    setupModals();
    setupHolidayModal();
    
    // Setup filters
    setupAdminFilters();
    
    // Setup export
    setupExport();
    
    // Load initial data
    loadDashboardStats();
    loadTodayAttendanceAdmin();
    loadEmployeesList();
}

/**
 * Update admin clock display
 */
function updateAdminClock() {
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
 * Setup admin navigation
 */
function setupAdminNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            const sectionId = item.dataset.section;
            
            // Update active nav
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Show section
            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === `${sectionId}Section`) {
                    section.classList.add('active');
                }
            });
            
            // Close mobile sidebar
            document.getElementById('sidebar').classList.remove('mobile-open');
            
            // Load section data
            if (sectionId === 'employees') {
                loadEmployeesList();
            } else if (sectionId === 'reports') {
                loadMonthlySummary();
            } else if (sectionId === 'holidays') {
                loadHolidaysList();
            } else if (sectionId === 'leaves') {
                loadLeaveRequestsList();
            }
        });
    });
}

/**
 * Setup admin sidebar
 */
function setupAdminSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
    
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
        });
    }
    
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            const clickedMenuBtn = mobileMenuBtn && mobileMenuBtn.contains(e.target);
            if (!sidebar.contains(e.target) && !clickedMenuBtn) {
                sidebar.classList.remove('mobile-open');
            }
        }
    });
}

// ===================================
// Dashboard Statistics
// ===================================

/**
 * Load dashboard statistics
 */
async function loadDashboardStats() {
    const db = window.firebaseDb;
    
    try {
        // Get all employees (excluding admins for attendance count)
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        
        let totalEmployees = 0;
        const employeeIds = [];
        
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.role === 'employee') {
                totalEmployees++;
                employeeIds.push(doc.id);
            }
        });
        
        // Get today's attendance for every employee concurrently instead of one at a time
        const today = getTodayDate();
        const attendanceDocs = await Promise.all(
            employeeIds.map(empId => getDoc(doc(db, 'attendance', empId, 'records', today)))
        );

        let presentToday = 0;
        let checkedOut = 0;
        attendanceDocs.forEach(attendanceDoc => {
            if (attendanceDoc.exists()) {
                presentToday++;
                if (attendanceDoc.data().checkOut) {
                    checkedOut++;
                }
            }
        });
        
        const notCheckedIn = totalEmployees - presentToday;
        
        // Update UI
        document.getElementById('totalEmployees').textContent = totalEmployees;
        document.getElementById('presentToday').textContent = presentToday;
        document.getElementById('checkedOut').textContent = checkedOut;
        document.getElementById('notCheckedIn').textContent = notCheckedIn;
        
    } catch (error) {
        console.error('Error loading stats:', error);
        showToast('Error loading dashboard statistics', 'error');
    }
}

/**
 * Load today's attendance for admin view
 */
async function loadTodayAttendanceAdmin() {
    const db = window.firebaseDb;
    const tableBody = document.getElementById('todayAttendanceTable');
    const today = getTodayDate();
    
    try {
        // Get all employees
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        
        const employees = [];
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.role === 'employee') {
                employees.push({ id: doc.id, ...data });
            }
        });
        
        if (employees.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No employees found</td></tr>';
            return;
        }

        const holiday = await getHoliday(today);

        // Fetch every employee's today-record + paid-leave status concurrently
        // instead of one employee at a time (which was 2 round trips PER employee,
        // in sequence -- the main cause of the slow load with more than a couple
        // of employees).
        const rows = await Promise.all(employees.map(async (emp) => {
            const attendanceRef = doc(db, 'attendance', emp.id, 'records', today);
            const [attendanceDoc, paidLeave] = await Promise.all([
                getDoc(attendanceRef),
                getPaidLeave(emp.id, today)
            ]);
            const attendanceData = attendanceDoc.exists() ? attendanceDoc.data() : null;

            const resolved = resolveDayStatus({
                dateStr: today,
                attendanceData,
                holiday,
                paidLeave: paidLeave && paidLeave.status === 'approved' ? paidLeave : null,
                isFutureOrToday: true
            });

            return `
                <tr>
                    <td>${emp.name}</td>
                    <td>${emp.email}</td>
                    <td>${resolved.checkIn}</td>
                    <td>${resolved.checkOut}</td>
                    <td>${resolved.hours}</td>
                    <td><span class="status-badge ${resolved.statusClass}">${resolved.statusLabel}</span></td>
                </tr>
            `;
        }));

        tableBody.innerHTML = rows.join('');
        
    } catch (error) {
        console.error('Error loading today attendance:', error);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading data</td></tr>';
    }
}

// Refresh button
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshTodayBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadDashboardStats();
            loadTodayAttendanceAdmin();
            showToast('Data refreshed', 'success');
        });
    }
});

// ===================================
// Employee Management
// ===================================

/**
 * Load employees list
 */
async function loadEmployeesList() {
    const db = window.firebaseDb;
    const tableBody = document.getElementById('employeesTable');
    const today = getTodayDate();
    
    try {
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        
        const employees = [];
        usersSnapshot.forEach(doc => {
            employees.push({ id: doc.id, ...doc.data() });
        });
        
        // Also populate filter dropdowns
        populateEmployeeFilters(employees);
        
        if (employees.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center">No employees found</td></tr>';
            return;
        }
        
        let html = '';
        
        for (const emp of employees) {
            // Get today's status
            let status = 'Not Checked In';
            let statusClass = '';
            
            const attendanceRef = doc(db, 'attendance', emp.id, 'records', today);
            const attendanceDoc = await getDoc(attendanceRef);
            
            if (attendanceDoc.exists()) {
                const data = attendanceDoc.data();
                status = data.status === 'present' ? 'Present' : 'Incomplete';
                statusClass = data.status === 'present' ? 'present' : 'incomplete';
            }
            
            const roleClass = emp.role === 'admin' ? 'text-info' : '';
            
            html += `
                <tr data-id="${emp.id}" data-role="${emp.role}">
                    <td>${emp.name}</td>
                    <td>${emp.email}</td>
                    <td class="${roleClass}">${emp.role.charAt(0).toUpperCase() + emp.role.slice(1)}</td>
                    <td><span class="status-badge ${statusClass}">${status}</span></td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn edit" onclick="editEmployee('${emp.id}')" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn delete" onclick="confirmDeleteEmployee('${emp.id}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }
        
        tableBody.innerHTML = html;
        
        // Setup search and filter
        setupEmployeeSearch();
        
    } catch (error) {
        console.error('Error loading employees:', error);
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading data</td></tr>';
    }
}

/**
 * Populate employee filter dropdowns
 * @param {Array} employees - List of employees
 */
function populateEmployeeFilters(employees) {
    const employeeFilter = document.getElementById('employeeFilter');
    const exportEmployee = document.getElementById('exportEmployee');
    
    // Clear existing options except first
    employeeFilter.innerHTML = '<option value="all">All Employees</option>';
    exportEmployee.innerHTML = '<option value="all">All Employees</option>';
    
    employees.forEach(emp => {
        if (emp.role === 'employee') {
            const option1 = document.createElement('option');
            option1.value = emp.id;
            option1.textContent = emp.name;
            employeeFilter.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = emp.id;
            option2.textContent = emp.name;
            exportEmployee.appendChild(option2);
        }
    });
}

/**
 * Setup employee search functionality
 */
function setupEmployeeSearch() {
    const searchInput = document.getElementById('employeeSearch');
    const roleFilter = document.getElementById('roleFilter');
    const tableBody = document.getElementById('employeesTable');
    
    function filterEmployees() {
        const searchTerm = searchInput.value.toLowerCase();
        const roleValue = roleFilter.value;
        const rows = tableBody.querySelectorAll('tr');
        
        rows.forEach(row => {
            const name = row.cells[0]?.textContent.toLowerCase() || '';
            const email = row.cells[1]?.textContent.toLowerCase() || '';
            const role = row.dataset.role;
            
            const matchesSearch = name.includes(searchTerm) || email.includes(searchTerm);
            const matchesRole = roleValue === 'all' || role === roleValue;
            
            row.style.display = matchesSearch && matchesRole ? '' : 'none';
        });
    }
    
    searchInput.addEventListener('input', filterEmployees);
    roleFilter.addEventListener('change', filterEmployees);
}

/**
 * Setup modals
 */
function setupModals() {
    const employeeModal = document.getElementById('employeeModal');
    const deleteModal = document.getElementById('deleteModal');
    
    // Add employee button
    document.getElementById('addEmployeeBtn').addEventListener('click', () => {
        openEmployeeModal();
    });
    
    // Close buttons
    document.getElementById('closeModal').addEventListener('click', () => {
        employeeModal.classList.remove('active');
    });
    
    document.getElementById('cancelModal').addEventListener('click', () => {
        employeeModal.classList.remove('active');
    });
    
    document.getElementById('closeDeleteModal').addEventListener('click', () => {
        deleteModal.classList.remove('active');
    });
    
    document.getElementById('cancelDelete').addEventListener('click', () => {
        deleteModal.classList.remove('active');
    });
    
    // Employee form submission
    document.getElementById('employeeForm').addEventListener('submit', handleEmployeeSubmit);
    
    // Delete confirmation
    document.getElementById('confirmDelete').addEventListener('click', handleDeleteEmployee);
    
    // Close on outside click
    employeeModal.addEventListener('click', (e) => {
        if (e.target === employeeModal) {
            employeeModal.classList.remove('active');
        }
    });
    
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) {
            deleteModal.classList.remove('active');
        }
    });
}

/**
 * Open employee modal for add/edit
 * @param {Object} employee - Employee data for editing (optional)
 */
function openEmployeeModal(employee = null) {
    const modal = document.getElementById('employeeModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('employeeForm');
    const passwordGroup = document.getElementById('passwordGroup');
    
    form.reset();
    
    if (employee) {
        title.textContent = 'Edit Employee';
        document.getElementById('editEmployeeId').value = employee.id;
        document.getElementById('empName').value = employee.name;
        document.getElementById('empEmail').value = employee.email;
        document.getElementById('empEmail').disabled = true;
        document.getElementById('empRole').value = employee.role;
        passwordGroup.style.display = 'none';
    } else {
        title.textContent = 'Add Employee';
        document.getElementById('editEmployeeId').value = '';
        document.getElementById('empEmail').disabled = false;
        passwordGroup.style.display = 'block';
    }
    
    modal.classList.add('active');
}

/**
 * Edit employee
 * @param {string} employeeId - Employee ID
 */
async function editEmployee(employeeId) {
    const db = window.firebaseDb;
    
    try {
        const userDoc = await getDoc(doc(db, 'users', employeeId));
        if (userDoc.exists()) {
            openEmployeeModal({ id: employeeId, ...userDoc.data() });
        }
    } catch (error) {
        console.error('Error fetching employee:', error);
        showToast('Error loading employee data', 'error');
    }
}

/**
 * Handle employee form submission
 * @param {Event} e - Form submit event
 */
async function handleEmployeeSubmit(e) {
    e.preventDefault();
    
    const employeeId = document.getElementById('editEmployeeId').value;
    const name = document.getElementById('empName').value.trim();
    const email = document.getElementById('empEmail').value.trim();
    const password = document.getElementById('empPassword').value;
    const role = document.getElementById('empRole').value;
    
    showLoading();
    
    try {
        if (employeeId) {
            // Update existing employee
            const db = window.firebaseDb;
            await updateDoc(doc(db, 'users', employeeId), {
                name: name,
                role: role
            });
            
            showToast('Employee updated successfully', 'success');
        } else {
            // Create new employee
            if (!password || password.length < 6) {
                hideLoading();
                showToast('Password must be at least 6 characters', 'error');
                return;
            }
            
            await registerUser(email, password, name, role);
            showToast('Employee added successfully', 'success');
        }
        
        document.getElementById('employeeModal').classList.remove('active');
        loadEmployeesList();
        loadDashboardStats();
        
    } catch (error) {
        console.error('Error saving employee:', error);
        showToast(getErrorMessage(error.code) || 'Error saving employee', 'error');
    }
    
    hideLoading();
}

/**
 * Confirm delete employee — shows name in modal for clarity
 * @param {string} employeeId - Employee ID
 */
async function confirmDeleteEmployee(employeeId) {
    const db = window.firebaseDb;
    document.getElementById('deleteEmployeeId').value = employeeId;

    // Show employee name in the confirmation message
    try {
        const userDoc = await getDoc(doc(db, 'users', employeeId));
        const name = userDoc.exists() ? userDoc.data().name : 'this employee';
        document.getElementById('deleteEmployeeName').textContent = name;
    } catch {
        document.getElementById('deleteEmployeeName').textContent = 'this employee';
    }

    document.getElementById('deleteModal').classList.add('active');
}

/**
 * Handle employee deletion - removes user doc + all attendance records
 */
async function handleDeleteEmployee() {
    const employeeId = document.getElementById('deleteEmployeeId').value;
    const db = window.firebaseDb;

    showLoading();

    try {
        // 1. Delete all attendance records for this employee
        const attendanceRef = collection(db, 'attendance', employeeId, 'records');
        const attendanceSnapshot = await getDocs(attendanceRef);
        const deletePromises = [];
        attendanceSnapshot.forEach(record => {
            deletePromises.push(deleteDoc(record.ref));
        });
        await Promise.all(deletePromises);

        // 2. Delete the attendance parent document
        await deleteDoc(doc(db, 'attendance', employeeId)).catch(() => {});

        // 3. Delete the user document
        await deleteDoc(doc(db, 'users', employeeId));

        document.getElementById('deleteModal').classList.remove('active');
        showToast('Employee and all their records deleted successfully', 'success');
        loadEmployeesList();
        loadDashboardStats();

    } catch (error) {
        console.error('Error deleting employee:', error);
        showToast('Error deleting employee. Please try again.', 'error');
    }

    hideLoading();
}

// ===================================
// Attendance Records
// ===================================

/**
 * Setup admin filters
 */
function setupAdminFilters() {
    // Date filters
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    
    // Set default dates (current month, but never before launch)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayStr = toLocalDateString(firstDay);
    
    dateFrom.value = firstDayStr < LAUNCH_DATE ? LAUNCH_DATE : firstDayStr;
    dateTo.value = toLocalDateString(today);
    
    // Apply filter button
    document.getElementById('applyFilterBtn').addEventListener('click', loadAttendanceRecords);
    
    // Clear filter button
    document.getElementById('clearFilterBtn').addEventListener('click', () => {
        document.getElementById('employeeFilter').value = 'all';
        dateFrom.value = firstDayStr < LAUNCH_DATE ? LAUNCH_DATE : firstDayStr;
        dateTo.value = toLocalDateString(today);
        document.getElementById('attendanceRecordsTable').innerHTML = 
            '<tr><td colspan="6" class="text-center">Select filters and click Apply</td></tr>';
    });
    
    // Export filters
    const exportMonth = document.getElementById('exportMonth');
    const exportYear = document.getElementById('exportYear');
    
    exportMonth.value = today.getMonth();
    
    // Populate year dropdown (from launch year to current year - no history before launch)
    const currentYear = today.getFullYear();
    const launchYear = parseInt(LAUNCH_DATE.split('-')[0]);
    for (let year = currentYear; year >= launchYear; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        exportYear.appendChild(option);
    }
}

/**
 * Load attendance records based on filters
 */
async function loadAttendanceRecords() {
    const db = window.firebaseDb;
    const tableBody = document.getElementById('attendanceRecordsTable');
    
    const employeeId = document.getElementById('employeeFilter').value;
    let dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    
    if (!dateFrom || !dateTo) {
        showToast('Please select date range', 'warning');
        return;
    }

    if (dateFrom < LAUNCH_DATE) dateFrom = LAUNCH_DATE;
    
    showLoading();
    
    try {
        let employees = [];
        
        if (employeeId === 'all') {
            // Get all employees
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('role', '==', 'employee'));
            const snapshot = await getDocs(q);
            snapshot.forEach(doc => {
                employees.push({ id: doc.id, ...doc.data() });
            });
        } else {
            // Get specific employee
            const userDoc = await getDoc(doc(db, 'users', employeeId));
            if (userDoc.exists()) {
                employees.push({ id: employeeId, ...userDoc.data() });
            }
        }

        // Every calendar date in the selected range (so Week Off / Holiday / Absent
        // days show up even when there's no attendance document for that date)
        const dateList = [];
        const cursor = new Date(dateFrom);
        const rangeEnd = new Date(dateTo);
        while (cursor <= rangeEnd) {
            dateList.push(toLocalDateString(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }

        const holidayMap = await getHolidaysInRange(dateFrom, dateTo);
        const todayStr = getTodayDate();
        
        let allRecords = [];

        // Fetch every employee's attendance + leave records concurrently
        const perEmployee = await Promise.all(employees.map(async (emp) => {
            const attendanceRef = collection(db, 'attendance', emp.id, 'records');
            const q = query(
                attendanceRef,
                where('date', '>=', dateFrom),
                where('date', '<=', dateTo)
            );
            const [snapshot, leaveMap] = await Promise.all([
                getDocs(q),
                getApprovedLeavesInRange(emp.id, dateFrom, dateTo)
            ]);
            const attendanceMap = new Map();
            snapshot.forEach(docSnap => attendanceMap.set(docSnap.id, docSnap.data()));
            return { emp, attendanceMap, leaveMap };
        }));

        for (const { emp, attendanceMap, leaveMap } of perEmployee) {

            for (const dateStr of dateList) {
                const resolved = resolveDayStatus({
                    dateStr,
                    attendanceData: attendanceMap.get(dateStr) || null,
                    holiday: holidayMap.get(dateStr) || null,
                    paidLeave: leaveMap.get(dateStr) || null,
                    isFutureOrToday: dateStr >= todayStr
                });
                allRecords.push({ date: dateStr, employeeName: emp.name, ...resolved });
            }
        }
        
        // Sort by date descending, then employee name
        allRecords.sort((a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName));
        
        if (allRecords.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No records found</td></tr>';
            hideLoading();
            return;
        }
        
        let html = '';
        allRecords.forEach(record => {
            const date = new Date(record.date);
            
            html += `
                <tr>
                    <td>${date.toLocaleDateString()}</td>
                    <td>${record.employeeName}</td>
                    <td>${record.checkIn}</td>
                    <td>${record.checkOut}</td>
                    <td>${record.hours}</td>
                    <td><span class="status-badge ${record.statusClass}">${record.statusLabel}</span></td>
                </tr>
            `;
        });
        
        tableBody.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading attendance records:', error);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading data</td></tr>';
    }
    
    hideLoading();
}

// ===================================
// Reports & Export
// ===================================

/**
 * Setup export functionality
 */
function setupExport() {
    document.getElementById('exportCsvBtn').addEventListener('click', exportToCSV);
}

/**
 * Export attendance data to CSV
 */
async function exportToCSV() {
    const db = window.firebaseDb;
    
    const employeeId = document.getElementById('exportEmployee').value;
    const month = parseInt(document.getElementById('exportMonth').value);
    const year = parseInt(document.getElementById('exportYear').value);
    
    // Calculate date range
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDayStr = toLocalDateString(firstDay);
    const lastDayStr = toLocalDateString(lastDay);
    
    showLoading();
    
    try {
        let employees = [];
        
        if (employeeId === 'all') {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('role', '==', 'employee'));
            const snapshot = await getDocs(q);
            snapshot.forEach(doc => {
                employees.push({ id: doc.id, ...doc.data() });
            });
        } else {
            const userDoc = await getDoc(doc(db, 'users', employeeId));
            if (userDoc.exists()) {
                employees.push({ id: employeeId, ...userDoc.data() });
            }
        }
        
        let csvData = [];
        csvData.push(['Date', 'Employee Name', 'Email', 'Check In', 'Check Out', 'Total Hours', 'Less/OT', 'Status']);

        const dateList = getDaysInMonth(year, month).filter(d => d >= LAUNCH_DATE && d <= getTodayDate());
        const holidayMap = await getHolidaysInRange(firstDayStr, lastDayStr);
        
        const perEmployee = await Promise.all(employees.map(async (emp) => {
            const attendanceRef = collection(db, 'attendance', emp.id, 'records');
            const q = query(
                attendanceRef,
                where('date', '>=', firstDayStr),
                where('date', '<=', lastDayStr)
            );
            const [snapshot, leaveMap] = await Promise.all([
                getDocs(q),
                getApprovedLeavesInRange(emp.id, firstDayStr, lastDayStr)
            ]);
            const attendanceMap = new Map();
            snapshot.forEach(docSnap => attendanceMap.set(docSnap.id, docSnap.data()));
            return { emp, attendanceMap, leaveMap };
        }));

        for (const { emp, attendanceMap, leaveMap } of perEmployee) {

            for (const dateStr of dateList) {
                const resolved = resolveDayStatus({
                    dateStr,
                    attendanceData: attendanceMap.get(dateStr) || null,
                    holiday: holidayMap.get(dateStr) || null,
                    paidLeave: leaveMap.get(dateStr) || null,
                    isFutureOrToday: dateStr === getTodayDate()
                });

                // Plain-text version of the Less/OT badge for the CSV
                let lessOtText = '--';
                if (resolved.lessValue > 0) lessOtText = `-${formatHoursMinutes(resolved.lessValue)}`;
                else if (resolved.overtimeValue > 0) lessOtText = `+${formatHoursMinutes(resolved.overtimeValue)}`;
                else if (resolved.status === 'present') lessOtText = 'On time';

                csvData.push([
                    dateStr, emp.name, emp.email,
                    resolved.checkIn, resolved.checkOut, resolved.hours,
                    lessOtText, resolved.statusLabel
                ]);
            }
        }
        
        if (csvData.length === 1) {
            hideLoading();
            showToast('No data to export', 'warning');
            return;
        }
        
        // Generate CSV
        const csvContent = csvData.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        
        // Download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        const filename = `attendance_${monthNames[month]}_${year}.csv`;
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('CSV exported successfully', 'success');
        
    } catch (error) {
        console.error('Error exporting CSV:', error);
        showToast('Error exporting data', 'error');
    }
    
    hideLoading();
}

/**
 * Load monthly summary statistics
 */
async function loadMonthlySummary() {
    const db = window.firebaseDb;
    
    const month = parseInt(document.getElementById('exportMonth').value);
    const year = parseInt(document.getElementById('exportYear').value);
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDayStr = toLocalDateString(firstDay);
    const lastDayStr = toLocalDateString(lastDay);
    const todayStr = getTodayDate();
    
    try {
        // Get all employees
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('role', '==', 'employee'));
        const usersSnapshot = await getDocs(q);
        
        const employees = [];
        usersSnapshot.forEach(doc => {
            employees.push({ id: doc.id, ...doc.data() });
        });

        const dateList = getDaysInMonth(year, month).filter(d => d >= LAUNCH_DATE);
        const holidayMap = await getHolidaysInRange(firstDayStr, lastDayStr);

        let presentCount = 0, weekOffCount = 0, holidayCount = 0, paidLeaveCount = 0, absentCount = 0;
        let totalHours = 0, totalLess = 0, totalOvertime = 0;

        // Fetch every employee's attendance + leave records concurrently
        const perEmployee = await Promise.all(employees.map(async (emp) => {
            const attendanceRef = collection(db, 'attendance', emp.id, 'records');
            const attendanceQuery = query(
                attendanceRef,
                where('date', '>=', firstDayStr),
                where('date', '<=', lastDayStr)
            );
            const [snapshot, leaveMap] = await Promise.all([
                getDocs(attendanceQuery),
                getApprovedLeavesInRange(emp.id, firstDayStr, lastDayStr)
            ]);
            const attendanceMap = new Map();
            snapshot.forEach(docSnap => attendanceMap.set(docSnap.id, docSnap.data()));
            return { attendanceMap, leaveMap };
        }));

        for (const { attendanceMap, leaveMap } of perEmployee) {

            for (const dateStr of dateList) {
                // Skip days that haven't happened yet this month
                if (dateStr > todayStr) continue;

                const resolved = resolveDayStatus({
                    dateStr,
                    attendanceData: attendanceMap.get(dateStr) || null,
                    holiday: holidayMap.get(dateStr) || null,
                    paidLeave: leaveMap.get(dateStr) || null,
                    isFutureOrToday: dateStr === todayStr
                });

                if (resolved.status === 'present') {
                    presentCount++;
                    totalHours += resolved.hoursValue || 0;
                    totalLess += resolved.lessValue;
                    totalOvertime += resolved.overtimeValue;
                } else if (resolved.status === 'week-off') {
                    weekOffCount++;
                } else if (resolved.status === 'holiday') {
                    holidayCount++;
                } else if (resolved.status === 'paid-leave') {
                    paidLeaveCount++;
                } else if (resolved.status === 'absent') {
                    absentCount++;
                }
                // 'incomplete' (checked in but not out) and 'not-marked' (today, no action yet)
                // are intentionally excluded from every bucket above.
            }
        }
        
        const avgHours = presentCount > 0 ? totalHours / presentCount : 0;
        
        // Update UI
        document.getElementById('summaryPresent').textContent = presentCount;
        document.getElementById('summaryWeekOff').textContent = weekOffCount;
        document.getElementById('summaryHoliday').textContent = holidayCount;
        document.getElementById('summaryPaidLeave').textContent = paidLeaveCount;
        document.getElementById('summaryAbsent').textContent = absentCount;
        document.getElementById('summaryTotalHours').textContent = formatHoursMinutes(totalHours);
        document.getElementById('summaryAvgHours').textContent = formatHoursMinutes(avgHours);
        document.getElementById('summaryLessHours').textContent = formatHoursMinutes(totalLess);
        document.getElementById('summaryOvertime').textContent = formatHoursMinutes(totalOvertime);
        
    } catch (error) {
        console.error('Error loading monthly summary:', error);
        showToast('Error loading monthly summary', 'error');
    }
}

// ===================================
// Holiday Management
// ===================================

/**
 * Load and render the holidays list
 */
async function loadHolidaysList() {
    const tableBody = document.getElementById('holidaysTable');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="3" class="text-center">Loading...</td></tr>';

    try {
        const holidays = await getAllHolidays();

        if (holidays.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" class="text-center">No holidays added yet</td></tr>';
            return;
        }

        let html = '';
        holidays.forEach(h => {
            const date = new Date(h.date);
            html += `
                <tr>
                    <td>${date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</td>
                    <td>${h.name}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="openHolidayModal('${h.id}', '${h.name.replace(/'/g, "\\'")}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="handleDeleteHoliday('${h.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tableBody.innerHTML = html;

    } catch (error) {
        console.error('Error loading holidays:', error);
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Error loading holidays</td></tr>';
    }
}

/**
 * Setup the Add/Edit Holiday modal
 */
function setupHolidayModal() {
    const addBtn = document.getElementById('addHolidayBtn');
    const closeBtn = document.getElementById('closeHolidayModal');
    const cancelBtn = document.getElementById('cancelHolidayModal');
    const form = document.getElementById('holidayForm');

    if (addBtn) addBtn.addEventListener('click', () => openHolidayModal());
    if (closeBtn) closeBtn.addEventListener('click', closeHolidayModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeHolidayModal);

    const modal = document.getElementById('holidayModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeHolidayModal();
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const date = document.getElementById('holidayDate').value;
            const name = document.getElementById('holidayName').value.trim();
            const originalDate = document.getElementById('originalHolidayDate').value;

            if (!date || !name) {
                showToast('Please fill in both the date and the holiday name.', 'warning');
                return;
            }

            showLoading();
            try {
                // If editing and the date changed, remove the old entry first
                if (originalDate && originalDate !== date) {
                    await deleteHoliday(originalDate);
                }
                await saveHoliday(date, name);
                hideLoading();
                closeHolidayModal();
                showToast('Holiday saved successfully!', 'success');
                loadHolidaysList();
            } catch (error) {
                hideLoading();
                console.error('Error saving holiday:', error);
                showToast('Failed to save holiday. Please try again.', 'error');
            }
        });
    }
}

/**
 * Open the holiday modal, optionally pre-filled for editing
 */
function openHolidayModal(dateId = null, name = null) {
    const form = document.getElementById('holidayForm');
    if (form) form.reset();

    document.getElementById('originalHolidayDate').value = dateId || '';
    document.getElementById('holidayModalTitle').textContent = dateId ? 'Edit Holiday' : 'Add Holiday';

    if (dateId) {
        document.getElementById('holidayDate').value = dateId;
        document.getElementById('holidayName').value = name || '';
    }

    document.getElementById('holidayModal').classList.add('active');
}

/**
 * Close the holiday modal
 */
function closeHolidayModal() {
    document.getElementById('holidayModal').classList.remove('active');
}

/**
 * Delete a holiday after confirmation
 */
async function handleDeleteHoliday(dateId) {
    if (!confirm('Delete this holiday? This cannot be undone.')) return;

    showLoading();
    try {
        await deleteHoliday(dateId);
        hideLoading();
        showToast('Holiday deleted.', 'success');
        loadHolidaysList();
    } catch (error) {
        hideLoading();
        console.error('Error deleting holiday:', error);
        showToast('Failed to delete holiday.', 'error');
    }
}

// ===================================
// Leave Requests
// ===================================

/**
 * Load and render paid leave requests for all employees
 */
async function loadLeaveRequestsList() {
    const db = window.firebaseDb;
    const tableBody = document.getElementById('leaveRequestsTable');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';

    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('role', '==', 'employee'));
        const usersSnapshot = await getDocs(q);

        const employees = [];
        usersSnapshot.forEach(doc => employees.push({ id: doc.id, ...doc.data() }));

        const requests = await getAllLeaveRequests(employees);

        if (requests.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center">No leave requests found</td></tr>';
            return;
        }

        let html = '';
        requests.forEach(r => {
            const date = new Date(r.date);
            const statusClass = r.status === 'approved' ? 'present' : (r.status === 'rejected' ? 'absent' : 'incomplete');
            const statusLabel = r.status.charAt(0).toUpperCase() + r.status.slice(1);

            const actions = r.status === 'pending'
                ? `<button class="btn btn-sm btn-success" onclick="handleLeaveDecision('${r.employeeId}', '${r.date}', 'approved')">
                        <i class="fas fa-check"></i> Approve
                   </button>
                   <button class="btn btn-sm btn-danger" onclick="handleLeaveDecision('${r.employeeId}', '${r.date}', 'rejected')">
                        <i class="fas fa-times"></i> Reject
                   </button>`
                : `<span class="text-muted">--</span>`;

            html += `
                <tr>
                    <td>${r.employeeName}</td>
                    <td>${date.toLocaleDateString()}</td>
                    <td>${r.reason || '--'}</td>
                    <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td>${actions}</td>
                </tr>
            `;
        });
        tableBody.innerHTML = html;

    } catch (error) {
        console.error('Error loading leave requests:', error);
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading leave requests</td></tr>';
    }
}

/**
 * Approve or reject a paid leave request
 */
async function handleLeaveDecision(employeeId, dateStr, decision) {
    showLoading();
    try {
        await decidePaidLeave(employeeId, dateStr, decision);
        hideLoading();
        showToast(`Leave request ${decision}.`, 'success');
        loadLeaveRequestsList();
    } catch (error) {
        hideLoading();
        console.error('Error deciding leave request:', error);
        showToast('Failed to update leave request.', 'error');
    }
}

// Make functions globally available
window.initAdminDashboard = initAdminDashboard;
window.setupAdminDashboard = setupAdminDashboard;
window.editEmployee = editEmployee;
window.confirmDeleteEmployee = confirmDeleteEmployee;
window.loadHolidaysList = loadHolidaysList;
window.openHolidayModal = openHolidayModal;
window.handleDeleteHoliday = handleDeleteHoliday;
window.loadLeaveRequestsList = loadLeaveRequestsList;
window.handleLeaveDecision = handleLeaveDecision;

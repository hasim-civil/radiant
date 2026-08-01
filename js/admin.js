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
            if (!sidebar.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
                sidebar.classList.remove('mobile-open');
            }
        }
    });
}

/**
 * Setup modals for employee management
 */
function setupModals_placeholder() {
    // This is a placeholder to maintain code structure
            if (text) text.textContent = 'Dark Mode';
        }
    }
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
        
        // Get today's attendance
        const today = getTodayDate();
        let presentToday = 0;
        let checkedOut = 0;
        
        for (const empId of employeeIds) {
            const attendanceRef = doc(db, 'attendance', empId, 'records', today);
            const attendanceDoc = await getDoc(attendanceRef);
            
            if (attendanceDoc.exists()) {
                presentToday++;
                if (attendanceDoc.data().checkOut) {
                    checkedOut++;
                }
            }
        }
        
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
        
        let html = '';
        
        for (const emp of employees) {
            const attendanceRef = doc(db, 'attendance', emp.id, 'records', today);
            const attendanceDoc = await getDoc(attendanceRef);
            
            let checkIn = '--:--';
            let checkOut = '--:--';
            let hours = '--';
            let status = 'Not Checked In';
            let statusClass = '';
            
            if (attendanceDoc.exists()) {
                const data = attendanceDoc.data();
                checkIn = data.checkIn ? formatTime(data.checkIn.toDate()) : '--:--';
                checkOut = data.checkOut ? formatTime(data.checkOut.toDate()) : '--:--';
                hours = data.totalHours !== null ? `${data.totalHours.toFixed(2)}h` : '--';
                status = data.status === 'present' ? 'Present' : 'Incomplete';
                statusClass = data.status === 'present' ? 'present' : 'incomplete';
            }
            
            html += `
                <tr>
                    <td>${emp.name}</td>
                    <td>${emp.email}</td>
                    <td>${checkIn}</td>
                    <td>${checkOut}</td>
                    <td>${hours}</td>
                    <td><span class="status-badge ${statusClass}">${status}</span></td>
                </tr>
            `;
        }
        
        tableBody.innerHTML = html;
        
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
    
    // Set default dates (current month)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    dateFrom.value = firstDay.toISOString().split('T')[0];
    dateTo.value = today.toISOString().split('T')[0];
    
    // Apply filter button
    document.getElementById('applyFilterBtn').addEventListener('click', loadAttendanceRecords);
    
    // Clear filter button
    document.getElementById('clearFilterBtn').addEventListener('click', () => {
        document.getElementById('employeeFilter').value = 'all';
        dateFrom.value = firstDay.toISOString().split('T')[0];
        dateTo.value = today.toISOString().split('T')[0];
        document.getElementById('attendanceRecordsTable').innerHTML = 
            '<tr><td colspan="6" class="text-center">Select filters and click Apply</td></tr>';
    });
    
    // Export filters
    const exportMonth = document.getElementById('exportMonth');
    const exportYear = document.getElementById('exportYear');
    
    exportMonth.value = today.getMonth();
    
    // Populate year dropdown
    const currentYear = today.getFullYear();
    for (let year = currentYear; year >= currentYear - 2; year--) {
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
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    
    if (!dateFrom || !dateTo) {
        showToast('Please select date range', 'warning');
        return;
    }
    
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
        
        let allRecords = [];
        
        for (const emp of employees) {
            const attendanceRef = collection(db, 'attendance', emp.id, 'records');
            const q = query(
                attendanceRef,
                where('date', '>=', dateFrom),
                where('date', '<=', dateTo),
                orderBy('date', 'desc')
            );
            const snapshot = await getDocs(q);
            
            snapshot.forEach(doc => {
                allRecords.push({
                    ...doc.data(),
                    employeeName: emp.name
                });
            });
        }
        
        // Sort by date descending
        allRecords.sort((a, b) => b.date.localeCompare(a.date));
        
        if (allRecords.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No records found</td></tr>';
            hideLoading();
            return;
        }
        
        let html = '';
        allRecords.forEach(record => {
            const date = new Date(record.date);
            const checkIn = record.checkIn ? formatTime(record.checkIn.toDate()) : '--:--';
            const checkOut = record.checkOut ? formatTime(record.checkOut.toDate()) : '--:--';
            const hours = record.totalHours !== null ? `${record.totalHours.toFixed(2)}h` : '--';
            const statusClass = record.status === 'present' ? 'present' : 'incomplete';
            const statusText = record.status === 'present' ? 'Present' : 'Incomplete';
            
            html += `
                <tr>
                    <td>${date.toLocaleDateString()}</td>
                    <td>${record.employeeName}</td>
                    <td>${checkIn}</td>
                    <td>${checkOut}</td>
                    <td>${hours}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
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
    const firstDayStr = firstDay.toISOString().split('T')[0];
    const lastDayStr = lastDay.toISOString().split('T')[0];
    
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
        csvData.push(['Date', 'Employee Name', 'Email', 'Check In', 'Check Out', 'Total Hours', 'Status']);
        
        for (const emp of employees) {
            const attendanceRef = collection(db, 'attendance', emp.id, 'records');
            const q = query(
                attendanceRef,
                where('date', '>=', firstDayStr),
                where('date', '<=', lastDayStr),
                orderBy('date', 'asc')
            );
            const snapshot = await getDocs(q);
            
            snapshot.forEach(doc => {
                const data = doc.data();
                const checkIn = data.checkIn ? formatTime(data.checkIn.toDate()) : '';
                const checkOut = data.checkOut ? formatTime(data.checkOut.toDate()) : '';
                const hours = data.totalHours !== null ? data.totalHours.toFixed(2) : '';
                const status = data.status === 'present' ? 'Present' : 'Incomplete';
                
                csvData.push([data.date, emp.name, emp.email, checkIn, checkOut, hours, status]);
            });
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
    const firstDayStr = firstDay.toISOString().split('T')[0];
    const lastDayStr = lastDay.toISOString().split('T')[0];
    
    try {
        // Get all employees
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('role', '==', 'employee'));
        const usersSnapshot = await getDocs(q);
        
        const employees = [];
        usersSnapshot.forEach(doc => {
            employees.push({ id: doc.id, ...doc.data() });
        });
        
        let totalRecords = 0;
        let totalHours = 0;
        let totalPresentDays = 0;
        
        // Calculate working days in month (excluding weekends)
        let workingDays = 0;
        const current = new Date(firstDay);
        while (current <= lastDay) {
            const day = current.getDay();
            if (day !== 0 && day !== 6) {
                workingDays++;
            }
            current.setDate(current.getDate() + 1);
        }
        
        for (const emp of employees) {
            const attendanceRef = collection(db, 'attendance', emp.id, 'records');
            const attendanceQuery = query(
                attendanceRef,
                where('date', '>=', firstDayStr),
                where('date', '<=', lastDayStr)
            );
            const snapshot = await getDocs(attendanceQuery);
            
            snapshot.forEach(doc => {
                const data = doc.data();
                totalRecords++;
                if (data.status === 'present') {
                    totalPresentDays++;
                    totalHours += data.totalHours || 0;
                }
            });
        }
        
        // Calculate average attendance
        const expectedAttendance = employees.length * workingDays;
        const avgAttendance = expectedAttendance > 0 ? (totalPresentDays / expectedAttendance * 100) : 0;
        
        // Update UI
        document.getElementById('summaryTotalDays').textContent = workingDays;
        document.getElementById('summaryAvgAttendance').textContent = `${avgAttendance.toFixed(1)}%`;
        document.getElementById('summaryTotalHours').textContent = `${totalHours.toFixed(1)}h`;
        
    } catch (error) {
        console.error('Error loading monthly summary:', error);
    }
}

// Make functions globally available
window.initAdminDashboard = initAdminDashboard;
window.setupAdminDashboard = setupAdminDashboard;
window.editEmployee = editEmployee;
window.confirmDeleteEmployee = confirmDeleteEmployee;

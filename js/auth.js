/**
 * Authentication Module
 * Handles user registration, login, logout, and password reset
 */

// ===================================
// Utility Functions
// ===================================

/**
 * Show loading overlay
 */
function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

/**
 * Show toast notification
 * @param {string} message - The message to display
 * @param {string} type - Type of toast: 'success', 'error', 'warning', 'info'
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <span class="toast-message">${message}</span>
        <button class="toast-close">&times;</button>
    `;
    
    container.appendChild(toast);
    
    // Close button functionality
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);
}

/**
 * Get user-friendly error message from Firebase error code
 * @param {string} errorCode - Firebase error code
 * @returns {string} User-friendly error message
 */
function getErrorMessage(errorCode) {
    const errorMessages = {
        'auth/email-already-in-use': 'This email is already registered. Please login instead.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/operation-not-allowed': 'Email/password accounts are not enabled.',
        'auth/weak-password': 'Password should be at least 6 characters.',
        'auth/user-disabled': 'This account has been disabled.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password. Please try again.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Please check your connection.'
    };
    
    return errorMessages[errorCode] || 'An error occurred. Please try again.';
}

/**
 * Format date to readable string
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
function formatDate(date) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

/**
 * Get today's date in YYYY-MM-DD format
 * @returns {string} Today's date
 */
function getTodayDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

/**
 * Format time from Date object
 * @param {Date} date - Date object
 * @returns {string} Formatted time (HH:MM AM/PM)
 */
function formatTime(date) {
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
}

// ===================================
// Authentication Functions
// ===================================

/**
 * Register a new user
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @param {string} name - User's full name
 * @param {string} role - User's role ('employee' or 'admin')
 */
async function registerUser(email, password, name, role) {
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;
    
    // Create user in Firebase Auth.
    // This will fail if email is already in Auth (which is correct behavior).
    const userCredential = await window.createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Update user profile with display name
    await window.updateProfile(user, { displayName: name });
    
    // Create user document in Firestore with the new Auth UID.
    // Note: if this email was previously registered and later deleted from Firebase Auth,
    // the old Firestore document (keyed by the old UID) may still exist as orphaned data.
    // That's harmless here since this new document uses a brand new UID, so there's no
    // collision - but an admin may want to clean up old orphaned docs periodically.
    await window.setDoc(window.doc(db, 'users', user.uid), {
        name: name,
        email: email,
        role: role,
        createdAt: window.Timestamp.now()
    });
    
    return user;
}

/**
 * Login user with email and password
 * @param {string} email - User's email
 * @param {string} password - User's password
 */
async function loginUser(email, password) {
    const auth = window.firebaseAuth;
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
}

/**
 * Logout current user
 */
async function logoutUser() {
    const auth = window.firebaseAuth;
    await signOut(auth);
    window.location.href = 'login.html';
}

/**
 * Send password reset email
 * @param {string} email - User's email
 */
async function resetPassword(email) {
    const auth = window.firebaseAuth;
    await sendPasswordResetEmail(auth, email);
}

/**
 * Get current user's data from Firestore
 * @param {string} uid - User's UID
 * @returns {Object} User data
 */
async function getUserData(uid) {
    const db = window.firebaseDb;
    const userDoc = await getDoc(doc(db, 'users', uid));
    
    if (userDoc.exists()) {
        return { id: userDoc.id, ...userDoc.data() };
    }
    return null;
}

/**
 * Check authentication state and redirect accordingly
 */
function checkAuthState() {
    const auth = window.firebaseAuth;
    
    onAuthStateChanged(auth, async (user) => {
        hideLoading();
        
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const authPages = ['login.html', 'register.html', 'forgot-password.html'];
        const protectedPages = ['dashboard.html', 'admin.html'];
        
        if (user) {
            // User is logged in
            const userData = await getUserData(user.uid);
            
            if (userData) {
                // Store user data in session
                sessionStorage.setItem('currentUser', JSON.stringify(userData));
                
                // Redirect based on role if on auth pages
                if (authPages.includes(currentPage)) {
                    if (userData.role === 'admin') {
                        window.location.href = 'admin.html';
                    } else {
                        window.location.href = 'dashboard.html';
                    }
                }
                
                // Check if user is on correct dashboard
                if (currentPage === 'admin.html' && userData.role !== 'admin') {
                    window.location.href = 'dashboard.html';
                }
                if (currentPage === 'dashboard.html' && userData.role === 'admin') {
                    window.location.href = 'admin.html';
                }
            }
        } else {
            // User is not logged in
            sessionStorage.removeItem('currentUser');
            
            // Redirect to login if on protected pages
            if (protectedPages.includes(currentPage)) {
                window.location.href = 'login.html';
            }
        }
    });
}

/**
 * Get current user from session storage
 * @returns {Object|null} Current user data
 */
function getCurrentUser() {
    const userData = sessionStorage.getItem('currentUser');
    return userData ? JSON.parse(userData) : null;
}

// Make functions globally available
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showToast = showToast;
window.getErrorMessage = getErrorMessage;
window.formatDate = formatDate;
window.getTodayDate = getTodayDate;
window.formatTime = formatTime;
window.registerUser = registerUser;
window.loginUser = loginUser;
window.logoutUser = logoutUser;
window.resetPassword = resetPassword;
window.getUserData = getUserData;
window.checkAuthState = checkAuthState;
window.getCurrentUser = getCurrentUser;

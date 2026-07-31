# Radiant Attendance - Employee Attendance Management System

A modern, full-featured employee attendance management web application built with HTML, CSS, JavaScript, and Firebase.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Firebase](https://img.shields.io/badge/Firebase-10.7.1-orange.svg)
![Status](https://img.shields.io/badge/status-production--ready-green.svg)

## Features

### Authentication
- Email/Password registration and login
- Password reset via email
- Role-based access control (Admin/Employee)
- Secure session management

### Employee Features
- One-click Check In / Check Out
- View today's attendance status
- Monthly attendance history
- Total working hours tracking
- Personal profile view
- Duplicate check-in/out prevention

### Admin Features
- Dashboard with real-time statistics
- View all employees
- Today's attendance overview
- Attendance history with filters
- Search and filter employees
- Add/Edit/Delete employees
- Export attendance to CSV
- Monthly summary reports

### UI/UX
- Modern, responsive design
- Dark/Light mode toggle
- Mobile-friendly interface
- Toast notifications
- Loading animations
- Gradient color scheme

## Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Backend:** Firebase (Authentication + Firestore)
- **Hosting:** GitLab Pages / GitHub Pages
- **Icons:** Font Awesome 6

## Project Structure

```
attendance/
├── index.html              # Landing page
├── login.html              # Login page
├── register.html           # Registration page
├── forgot-password.html    # Password reset page
├── dashboard.html          # Employee dashboard
├── admin.html              # Admin dashboard
├── css/
│   └── style.css          # Main stylesheet
├── js/
│   ├── firebase.js        # Firebase configuration
│   ├── auth.js            # Authentication module
│   ├── attendance.js      # Employee attendance module
│   └── admin.js           # Admin dashboard module
└── README.md              # This file
```

## Setup Instructions

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter a project name (e.g., "radiant-attendance")
4. Disable Google Analytics (optional) and click "Create project"
5. Wait for the project to be created, then click "Continue"

### 2. Enable Authentication

1. In your Firebase project, click "Authentication" in the left sidebar
2. Click "Get started"
3. Click on "Email/Password" under "Sign-in providers"
4. Toggle "Enable" for Email/Password
5. Click "Save"

### 3. Create Firestore Database

1. Click "Firestore Database" in the left sidebar
2. Click "Create database"
3. Select "Start in test mode" (we'll add security rules later)
4. Choose a location closest to your users
5. Click "Enable"

### 4. Get Firebase Configuration

1. Click the gear icon ⚙️ next to "Project Overview"
2. Select "Project settings"
3. Scroll down to "Your apps" section
4. Click the web icon `</>`
5. Register your app with a nickname (e.g., "attendance-web")
6. Copy the `firebaseConfig` object

### 5. Configure the Application

1. Open `js/firebase.js`
2. Replace the placeholder configuration with your Firebase config:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

### 6. Set Up Firebase Security Rules

In Firebase Console, go to Firestore Database > Rules and replace with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      // Users can read their own data
      allow read: if request.auth != null && request.auth.uid == userId;
      // Users can create their own document during registration
      allow create: if request.auth != null && request.auth.uid == userId;
      // Only admins can read all users
      allow read: if request.auth != null && 
                    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
      // Only admins can update/delete users
      allow update, delete: if request.auth != null && 
                              get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Attendance collection
    match /attendance/{userId}/records/{date} {
      // Users can read/write their own attendance
      allow read, write: if request.auth != null && request.auth.uid == userId;
      // Admins can read all attendance
      allow read: if request.auth != null && 
                    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

Click "Publish" to save the rules.

### 7. Create the First Admin User

1. Open the application in your browser
2. Click "Get Started" or go to the Register page
3. Fill in your details:
   - Full Name: Your Name
   - Email: your-email@example.com
   - Password: (at least 6 characters)
   - Account Type: **Admin**
4. Click "Create Account"
5. You'll be redirected to the Admin Dashboard

## Deployment

### GitLab Pages

1. Push your code to a GitLab repository
2. Create a `.gitlab-ci.yml` file in the root:

```yaml
pages:
  stage: deploy
  script:
    - mkdir .public
    - cp -r * .public
    - mv .public public
  artifacts:
    paths:
      - public
  only:
    - main
```

3. Go to Settings > Pages to see your deployed URL

### GitHub Pages

1. Push your code to a GitHub repository
2. Go to Settings > Pages
3. Under "Source", select "main" branch
4. Click "Save"
5. Your site will be available at `https://username.github.io/repository-name`

### Local Development

1. Clone the repository
2. Configure Firebase (see steps above)
3. Use a local server (required for ES modules):

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve

# Using PHP
php -S localhost:8000
```

4. Open `http://localhost:8000` in your browser

## Firestore Data Structure

### Users Collection
```
users/
  {uid}/
    name: string
    email: string
    role: "admin" | "employee"
    createdAt: timestamp
```

### Attendance Collection
```
attendance/
  {uid}/
    records/
      {yyyy-mm-dd}/
        checkIn: timestamp
        checkOut: timestamp | null
        totalHours: number | null
        status: "present" | "incomplete"
        date: string
```

## Attendance Rules

1. **Check In**: Employees can check in once per day
2. **Check Out**: Only available after checking in
3. **Duplicate Prevention**: System prevents multiple check-ins/outs
4. **Status**:
   - `incomplete`: Checked in but not checked out
   - `present`: Both check-in and check-out completed

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge
- Mobile browsers (iOS Safari, Chrome for Android)

## Troubleshooting

### "Firebase is not defined" error
- Ensure you're running the app through a web server, not directly opening the HTML file
- Check that your Firebase config is correct

### Authentication errors
- Verify Email/Password authentication is enabled in Firebase Console
- Check that your API key is correct

### Firestore permission errors
- Ensure security rules are properly configured
- Check that the user is authenticated

### CORS errors
- Make sure you're using a local server for development
- Add your domain to Firebase authorized domains

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Firebase](https://firebase.google.com/) for backend services
- [Font Awesome](https://fontawesome.com/) for icons
- [Google Fonts](https://fonts.google.com/) for typography

---

Built with ❤️ for efficient attendance management

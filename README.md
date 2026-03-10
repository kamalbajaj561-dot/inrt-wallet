# INRT Wallet

A production-ready fintech wallet application built with React, Tailwind CSS, and Firebase.

## Setup Instructions

1.  **Firebase Setup**
    *   Go to [Firebase Console](https://console.firebase.google.com/).
    *   Create a new project.
    *   Enable **Authentication** and set up **Phone** sign-in.
        *   Add a test phone number (e.g., `+91 9876543210` with code `123456`) to test without SMS.
    *   Enable **Firestore Database** in test mode or production mode.
    *   Copy the `firestore.rules` content to your Firestore Rules tab.

2.  **Environment Variables**
    *   Copy `.env.example` to `.env` (or set secrets in AI Studio).
    *   Fill in the Firebase config values.

3.  **Admin Access**
    *   Sign up with a phone number.
    *   Go to Firestore Console > `users` collection.
    *   Find your user document and add a field `isAdmin: true` (boolean).
    *   Refresh the app to access the Admin Panel at `/admin`.

4.  **Cloud Functions (Required for Transfers)**
    *   This app uses Cloud Functions for secure money transfers.
    *   Install Firebase CLI: `npm install -g firebase-tools`
    *   Login: `firebase login`
    *   Initialize functions: `firebase init functions` (select your project)
    *   Replace `functions/index.js` with the provided code in `functions/index.js`.
    *   Deploy: `firebase deploy --only functions`
    *   **Note**: Cloud Functions require the Blaze (Pay as you go) plan on Firebase.

## Features

*   **Secure Login**: Phone number OTP authentication.
*   **Dashboard**: View balance and quick actions.
*   **Send Money**: Transfer funds to other users securely.
*   **Receive Money**: QR code generation for easy payments.
*   **Transaction History**: Track all your incoming and outgoing transfers.
*   **Admin Panel**: Manage users and freeze accounts.

## Tech Stack

*   **Frontend**: React + Vite
*   **Styling**: Tailwind CSS
*   **Backend**: Firebase (Auth + Firestore)
*   **Icons**: Lucide React

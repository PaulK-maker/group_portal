# Clerk Integration Setup

## Overview
PayPortal now uses Clerk for authentication, providing a secure and scalable identity solution with built-in support for email and phone-based sign-in, multi-factor authentication, and user management.

## Environment Variables

### Client (.env)
```env
VITE_CLERK_PUBLISHABLE_KEY=<your_clerk_publishable_key>
```

### Server (.env)
```env
CLERK_SECRET_KEY=<your_clerk_secret_key>
VITE_CLERK_PUBLISHABLE_KEY=<your_clerk_publishable_key>
```

## Setup Steps

1. **Create a Clerk Account**
   - Go to https://dashboard.clerk.com
   - Sign up for a new account
   - Create a new application

2. **Configure Clerk Application**
   - Set your Frontend URLs (development: http://localhost:5173)
   - Set your Allowed Origins for API requests (development: http://localhost:4000)
   - Enable Authentication Methods (Email, SMS/Phone)
   - Configure Sign-in options

3. **Get Your Keys**
   - Navigate to the API Keys section
   - Copy your Publishable Key
   - Copy your Secret Key
   - Add these to your `.env` files

4. **Update Vite Configuration** (if needed)
   - Ensure environment variables are properly exposed in client

5. **Database Migration**
   - The User model now uses `clerkId` for authentication
   - Existing users will be created on first login with their Clerk ID

## Authentication Flow

### Client-Side
1. User lands on Login page
2. ClerkProvider wraps the app with Clerk context
3. User authenticates via Clerk's SignIn component (email/phone)
4. Clerk sets authentication session
5. AuthContext uses Clerk's `useAuth()` to get session status
6. On app load, `/api/auth/me` endpoint is called to sync user data with database

### Server-Side
1. ClerkExpressWithAuth middleware validates Clerk tokens
2. User is looked up by `clerkId` in MongoDB
3. If user doesn't exist, new user is created
4. User memberships and group access are retrieved
5. Response includes user data and memberships

## Migration from Previous Auth

The old authentication system (email/phone codes) has been replaced with Clerk. Benefits:
- Professional, mobile-friendly sign-in UI
- Multi-factor authentication support
- Session management
- Social authentication ready (Google, GitHub, etc.)
- User management dashboard
- Compliance-ready (GDPR, SOC 2, etc.)

## Testing

1. **Local Development**
   ```bash
   # Client
   cd client && npm run dev
   # Server (in another terminal)
   cd server && npm run dev
   ```

2. **Sign-in Flow**
   - Navigate to http://localhost:5173
   - Click sign-in
   - Use Clerk's test credentials from your dashboard
   - Or create a real test account

## Troubleshooting

### "Publishable Key not found"
- Ensure `VITE_CLERK_PUBLISHABLE_KEY` is set in client/.env
- Check that it starts with `pk_`

### "Unauthorized" errors from server
- Verify `CLERK_SECRET_KEY` is set in server/.env
- Ensure Clerk middleware is applied to Express app
- Check that token is being sent from client in Authorization header

### User not found after sign-in
- First sign-in creates a new user record
- Check MongoDB connection
- Verify User model migration includes `clerkId` field

## Additional Resources
- [Clerk Documentation](https://clerk.com/docs)
- [Clerk + Express](https://clerk.com/docs/backend-requests/handling/express)
- [Clerk + React](https://clerk.com/docs/sdk/react/overview)

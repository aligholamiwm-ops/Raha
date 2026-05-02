# Troubleshooting Guide for Raha VPN

## User Creation Issues

### Problem: Users clicking "Open Raha VPN" button but user records are not being created

#### Root Causes and Solutions

1. **Missing BOT_TOKEN Configuration**
   - **Symptom**: User authentication fails with 500 error or "Server configuration error"
   - **Solution**: Ensure `BOT_TOKEN` is set in your `.env` file
   - **Check**: Look for this error in logs: `"CRITICAL: BOT_TOKEN is not set in environment variables!"`
   
2. **Missing init_data from Telegram**
   - **Symptom**: 403 error with "Missing Telegram init_data" message
   - **Solution**: Ensure users are opening the app through the Telegram bot button, not a direct URL
   - **Check**: Look for this warning in logs: `"Missing Telegram init_data in request headers"`
   
3. **Invalid init_data Signature**
   - **Symptom**: 403 error with "Invalid init_data signature"
   - **Possible Causes**:
     - BOT_TOKEN in backend doesn't match the actual bot token
     - init_data was modified or corrupted
     - Clock skew between Telegram servers and your server (very rare)
   - **Check**: Look for this warning in logs: `"Invalid init_data signature - hash mismatch"`

4. **Database Connection Issues**
   - **Symptom**: 500 error with "Failed to create user record"
   - **Solution**: Check MongoDB connection and ensure database is running
   - **Check**: Look for this error in logs: `"Failed to insert new user {telegram_id} into database"`

5. **Missing MINI_APP_URL Configuration**
   - **Symptom**: Bot shows "MINI_APP_URL is not configured" when users send /start
   - **Solution**: Set `MINI_APP_URL` in your `.env` file to your app's public URL
   - **Check**: Look for this warning in logs: `"WARNING: MINI_APP_URL is not set"`

#### Debugging Steps

1. **Check Application Logs**
   ```bash
   docker compose logs -f app
   ```
   
2. **Verify Configuration**
   ```bash
   # Check that critical variables are set
   docker compose exec app env | grep -E "(BOT_TOKEN|MINI_APP_URL|MONGODB_URL)"
   ```

3. **Test User Creation Directly**
   - Open the app via the Telegram bot (not a direct URL)
   - Open browser developer tools (F12) and check:
     - Network tab for API calls to `/api/v1/users/me`
     - Console tab for any JavaScript errors
     - Look for the response status and error message

4. **Check Database**
   ```bash
   # Connect to MongoDB and check if users collection exists
   docker compose exec mongodb mongosh raha_vpn --eval "db.users.countDocuments({})"
   ```

5. **Verify Telegram Bot Configuration**
   - Ensure your bot is set up with @BotFather
   - Verify the bot token matches what's in your `.env` file
   - Check that the bot has access to user messages if needed

## Security: Ensuring API is Only Accessible from Telegram

### How It Works

The application now enforces Telegram-only access through middleware that checks:

1. **User-Agent Headers**: Contains "telegram"
2. **Referer Headers**: From `t.me` or `web.telegram.org`
3. **Query Parameters**: Contains Telegram WebApp parameters
4. **Authorization Headers**: Contains valid Telegram init_data

### Exceptions

The following endpoints are exempt from Telegram-only enforcement:
- `/health` - Health check endpoint
- `/docs` and `/redoc` - API documentation
- `/api/v1/payments/webhook` - Payment webhooks (uses signature verification)
- `/api/v1/admin/*` - Admin endpoints (protected by role-based auth)

### Testing Security

1. **Test Direct API Access (Should Fail)**
   ```bash
   # This should return 403 Forbidden
   curl http://localhost:8000/api/v1/users/me
   ```

2. **Test Frontend Access (Should Fail)**
   ```bash
   # This should return 403 Forbidden
   curl http://localhost:8000/
   ```

3. **Test Telegram Access (Should Work)**
   - Access must be through the Telegram Mini App
   - The request will automatically include required headers

### Common Issues

1. **Legitimate Requests Being Blocked**
   - **Symptom**: 403 error "This service is only accessible from Telegram"
   - **Possible Causes**:
     - User opened app via direct URL instead of Telegram bot
     - Browser stripped Telegram headers (rare)
     - CORS issue preventing headers from being sent
   - **Solution**: Ensure users access the app only through the bot

2. **Admin API Blocked**
   - **Symptom**: Cannot access admin endpoints
   - **Note**: Admin endpoints are exempt from Telegram check but require admin role authentication

## Logging

The application now includes comprehensive logging for debugging:

- `INFO` level: Successful operations (user creation, authentication)
- `WARNING` level: Invalid requests or configuration issues
- `ERROR` level: Failed operations or critical configuration problems
- `DEBUG` level: Detailed flow information (when enabled)

### Key Log Messages

- `"Creating new user with telegram_id={id}"` - New user creation started
- `"Successfully created user {id}"` - User created successfully
- `"Found existing user with telegram_id={id}"` - Existing user authenticated
- `"Failed to insert new user {id} into database"` - Database error during user creation
- `"Invalid init_data signature - hash mismatch"` - Authentication failure
- `"Missing Telegram init_data in request headers"` - Missing authentication data

## Quick Reference

### Environment Variables Checklist
- [ ] `BOT_TOKEN` - Your Telegram bot token
- [ ] `MINI_APP_URL` - Public URL of your app
- [ ] `MONGODB_URL` - MongoDB connection string
- [ ] `SECRET_KEY` - Random secret for internal signing
- [ ] `PLISIO_API_KEY` - Plisio payment API key (if using payments)
- [ ] `PLISIO_SECRET_KEY` - Plisio webhook verification key

### User Flow Checklist
1. [ ] User sends /start to the bot
2. [ ] Bot displays "🚀 Open Raha VPN" button
3. [ ] User clicks the button
4. [ ] Telegram opens Mini App with init_data
5. [ ] Frontend loads and reads init_data from window.Telegram.WebApp
6. [ ] Frontend calls /api/v1/users/me with init_data
7. [ ] Backend validates init_data signature
8. [ ] Backend creates user record (if new) or returns existing user
9. [ ] Frontend displays user dashboard

### Testing Checklist
1. [ ] Test bot /start command
2. [ ] Test Mini App opening from bot button
3. [ ] Verify user record is created in MongoDB
4. [ ] Test that direct URL access is blocked
5. [ ] Test that API calls without init_data are blocked
6. [ ] Verify logs show user creation
7. [ ] Test referral system (if using /start deeplinks)

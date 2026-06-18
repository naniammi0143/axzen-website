# Axzen Marketplace

Axzen is a marketplace platform with:

- Customer website: `axzen.in`
- Seller website: `seller.axzen.in`
- Admin panel: `admin.axzen.in`
- Backend API: `api.axzen.in`

## Local Setup

```bash
npm install
copy .env.example .env
npm run dev
```

Open locally:

```text
http://localhost:3000
http://localhost:3000/seller
http://localhost:3000/admin
http://localhost:3000/api/health
```

## Environment Variables

```env
PORT=3000
MONGO_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/axzen?retryWrites=true&w=majority
JWT_SECRET=change-this-long-random-secret
FIREBASE_PROJECT_ID=axzen-c70e1
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"axzen-c70e1"}
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

`FIREBASE_SERVICE_ACCOUNT_JSON` is required in production for Firebase ID token verification.

## API Response Format

Success:

```json
{
  "ok": true,
  "data": {}
}
```

Error:

```json
{
  "ok": false,
  "message": "Validation failed."
}
```

## Ready API Groups

- `POST /api/auth/phone-login`
- `GET /api/products`
- `GET /api/categories`
- `GET /api/cart`
- `POST /api/cart`
- `GET /api/wishlist`
- `POST /api/wishlist`
- `POST /api/orders`
- `GET /api/orders/customer`
- `GET /api/orders/seller`
- `GET /api/sellers/me`
- `PUT /api/sellers/me`
- `PATCH /api/admin/sellers/:id/approve`
- `PATCH /api/admin/products/:id/approve`
- `GET /api/admin/finance/summary`

Compatibility endpoints currently used by the frontend:

- `GET /api/customer/catalog`
- `POST /api/customer/cart`
- `POST /api/customer/orders`
- `GET /api/seller/products`
- `POST /api/seller/products`
- `GET /api/dashboard/:role`

## Security Notes

- Firebase phone OTP happens in the browser.
- Backend verifies Firebase ID token, creates/checks MongoDB user, then returns JWT.
- Private routes use JWT middleware.
- Admin routes use role middleware.
- Auth route has rate limiting.
- Money is stored in integer paise, not floating point rupees.

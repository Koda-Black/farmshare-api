# Verification Module Documentation

## Overview

The verification module provides a comprehensive, production-ready solution for vendor identity verification in the FarmShare platform. It includes multiple verification services that work together to ensure vendors are legitimate before they can create pools and sell products.

## Architecture

### Services

1. **PaystackVerificationService** - Nigerian bank account verification
2. **FaceVerificationService** - Facial recognition and selfie matching
3. **DocumentOcrService** - Government ID document extraction using OCR
4. **CacVerificationService** - Business registration verification
5. **VerificationService** - Main orchestration service
6. **VerificationProcessor** - Background queue processor for async verification

### Verification Flow

```
User Initiates Verification
         ↓
[1] Document Selection (NIN/Passport/Driver's License/Voter's Card)
         ↓
[2] Document Upload + Selfie
         ↓
[3] OCR Extraction (DocumentOcrService)
         ↓
[4] Face Matching (FaceVerificationService)
         ↓
[5] Bank Account Verification (PaystackVerificationService)
         ↓
[6] Business Registration (Optional - CacVerificationService)
         ↓
User Status → VERIFIED
```

## Setup

### 1. Environment Variables

Add the following to your `.env` file:

```bash
# Face++ API (for face verification)
FACEPP_API_KEY=your_api_key_here
FACEPP_API_SECRET=your_api_secret_here

# Paystack (for bank verification - already configured)
PAYSTACK_SECRET_KEY=sk_test_your_key_here

# Optional: Third-party document verification services
# NIN_VERIFICATION_API_KEY=...  # e.g., Mono, Okra
# BUSINESS_REGISTRY_API_KEY=... # CAC API key when available
```

### 2. Install Dependencies

All required packages are already installed:
- `tesseract.js` - OCR engine for document text extraction
- `cheerio` - Web scraping for CAC verification
- `axios` - HTTP client (already installed)

### 3. Database Schema

The `Verification` model in Prisma is already set up:

```prisma
model Verification {
  id          String    @id @default(uuid())
  userId      String
  step        String
  status      VerificationStatus @default(PENDING)
  details     Json?
  externalReference String?
  createdAt   DateTime  @default(now())
  expiresAt   DateTime?

  user        User      @relation(fields: [userId], references: [id])
  @@index([userId, status])
}

enum VerificationStatus {
  NONE
  PENDING
  VERIFIED
  REJECTED
  EXPIRED
}
```

## API Endpoints

### Public Endpoints (Require Authentication)

#### 1. Get Supported Banks
```http
GET /verification/banks
Authorization: Bearer {token}
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Guaranty Trust Bank",
    "code": "058",
    "active": true
  }
]
```

---

#### 2. Verify Bank Account
```http
POST /verification/bank
Authorization: Bearer {token}
Content-Type: application/json

{
  "accountNumber": "0123456789",
  "bankCode": "058"
}
```

**Response:**
```json
{
  "success": true,
  "accountName": "JOHN DOE",
  "accountNumber": "0123456789",
  "bankCode": "058",
  "message": "Bank account verified successfully"
}
```

---

#### 3. Verify Face (Selfie vs ID)
```http
POST /verification/face
Authorization: Bearer {token}
Content-Type: application/json

{
  "selfieImage": "data:image/jpeg;base64,/9j/4AAQ...",
  "idCardImage": "data:image/jpeg;base64,/9j/4AAQ...",
  "confidenceThreshold": 70
}
```

**Response:**
```json
{
  "success": true,
  "confidence": 87.5,
  "facesDetected": 2,
  "message": "Face verification successful - faces match"
}
```

---

#### 4. Extract Document Data (OCR)
```http
POST /verification/document/ocr
Authorization: Bearer {token}
Content-Type: multipart/form-data

document: <file>
```

**Response:**
```json
{
  "success": true,
  "fullName": "John Doe",
  "documentNumber": "12345678901",
  "dateOfBirth": "01/01/1990",
  "gender": "M",
  "documentType": "NIN",
  "confidence": 92,
  "message": "Document data extracted successfully"
}
```

---

#### 5. Verify Business Registration (CAC)
```http
POST /verification/cac
Authorization: Bearer {token}
Content-Type: application/json

{
  "registrationNumber": "RC123456",
  "companyName": "Farmshare Technologies Limited"
}
```

**Response:**
```json
{
  "success": true,
  "companyName": "FARMSHARE TECHNOLOGIES LIMITED",
  "registrationNumber": "RC123456",
  "registrationDate": "2020-05-15",
  "businessType": "LIMITED LIABILITY COMPANY",
  "status": "ACTIVE",
  "message": "Business registration verified successfully"
}
```

---

#### 6. Health Check
```http
GET /verification/health
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "services": {
    "paystack": { "status": "healthy" },
    "faceVerification": { "status": "healthy" },
    "cacVerification": { "status": "unavailable" },
    "documentOcr": { "status": "healthy" }
  },
  "timestamp": "2025-10-14T21:00:00.000Z"
}
```

---

### Main Verification Flow Endpoints

#### 7. Start Verification
```http
POST /verification/start
Authorization: Bearer {token}
Content-Type: application/json

{
  "steps": ["govt_id", "bank", "business_reg"]
}
```

---

#### 8. Submit Verification Documents
```http
POST /verification/submit
Authorization: Bearer {token}
Content-Type: multipart/form-data

verificationId: <uuid>
metadata: {"idType": "NIN", "idNumber": "12345678901"}
files: [<file1>, <file2>]
```

---

#### 9. Get Verification Status
```http
GET /verification/status
Authorization: Bearer {token}
```

**Response:**
```json
{
  "overallStatus": "VERIFIED",
  "ninVerified": true,
  "bankVerified": true,
  "verifications": [
    {
      "id": "...",
      "step": "govt_id",
      "status": "VERIFIED",
      "createdAt": "...",
      "expiresAt": "..."
    }
  ]
}
```

---

### Admin Endpoints

#### 10. Override Verification Status
```http
POST /verification/admin/override
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "userId": "...",
  "status": "VERIFIED",
  "reason": "Manual verification completed"
}
```

---

#### 11. Get Pending Verifications
```http
GET /verification/admin/pending?skip=0&take=20
Authorization: Bearer {admin_token}
```

---

## Testing

### Running Tests

```bash
# Run all tests
yarn test

# Run tests with coverage
yarn test:cov

# Run tests in watch mode
yarn test:watch

# Run specific test file
yarn test src/verification/services/paystack-verification.service.spec.ts
```

### Test Files

- `paystack-verification.service.spec.ts` - Bank verification tests
- `face-verification.service.spec.ts` - Face matching tests
- `document-ocr.service.spec.ts` - OCR extraction tests
- `cac-verification.service.spec.ts` - Business verification tests

## Production Considerations

### 1. Paystack Bank Verification
- ✅ Production-ready
- Uses official Paystack API
- Automatic retries on failure
- Comprehensive error handling

### 2. Face++ Face Verification
- ✅ Production-ready
- Uses official Face++ API
- Requires API key and secret
- Consider rate limits (free tier: 1000 calls/month)

**Alternative:** Consider using local solutions like `face-api.js` for unlimited calls

### 3. Tesseract.js OCR
- ✅ Production-ready
- Runs locally (no external API required)
- Free and unlimited
- May need image preprocessing for better accuracy

**Tips for better OCR results:**
- Ensure good lighting
- High-resolution images (min 1200x1600px)
- Clear, unobstructed document view
- Pre-process images (grayscale, contrast adjustment)

### 4. CAC Business Verification
- ⚠️ Currently uses mock data
- Nigerian CAC portal requires web scraping or official API
- **Recommended alternatives for production:**
  - **Mono** (https://mono.co) - Nigerian financial data API
  - **Okra** (https://okra.ng) - Identity verification API
  - **Dojah** (https://dojah.io) - KYC verification API
  - **Smile Identity** (https://smileidentity.com) - African identity verification

**Implementation steps for production:**
1. Sign up for a third-party verification service
2. Replace `scrapeCACPublicSearch()` method with API call
3. Update environment variables with API keys
4. Test thoroughly with real business numbers

### 5. NIN Verification (Optional Enhancement)
Currently handled via OCR. For direct NIN verification:
- **Mono API** - https://mono.co/products/lookup
- **Okra API** - https://okra.ng
- **Nigeria NIMC** - When official API becomes available

---

## Security Best Practices

1. **API Keys**: Store all API keys in environment variables, never in code
2. **Rate Limiting**: Implement rate limiting on verification endpoints
3. **File Upload Security**:
   - Validate file types (only allow images)
   - Limit file sizes (max 5MB)
   - Scan for malware
4. **Data Privacy**:
   - Encrypt verification data at rest
   - Delete uploaded documents after processing
   - Comply with NDPR (Nigeria Data Protection Regulation)
5. **Retry Logic**: All external API calls have retry mechanisms
6. **Error Logging**: All errors are logged with Sentry/monitoring tools

---

## Troubleshooting

### Common Issues

#### 1. Face++ API Errors
```
Error: Face++ API not configured
```
**Solution:** Add `FACEPP_API_KEY` and `FACEPP_API_SECRET` to `.env`

---

#### 2. OCR Low Confidence
```
Error: Document text could not be read clearly
```
**Solutions:**
- Ensure image is well-lit and in focus
- Use higher resolution images
- Ensure document is flat and unobstructed
- Try different image formats (PNG often works better than JPEG)

---

#### 3. Bank Verification Fails
```
Error: Account number not found
```
**Solutions:**
- Verify account number is exactly 10 digits
- Ensure bank code is correct (use `/verification/banks` endpoint)
- Check Paystack API key is valid and active

---

#### 4. CAC Verification Returns Mock Data
This is expected in current implementation. See "Production Considerations" section above for real implementation options.

---

## Future Enhancements

1. **Liveness Detection**: Add liveness check to face verification (blink detection, head movement)
2. **Document Validation**: Integrate with official NIN/Passport verification APIs
3. **Blockchain Verification**: Store verification hashes on blockchain for immutability
4. **Real-time Webhooks**: Notify frontend instantly when verification completes
5. **Verification Analytics**: Dashboard showing verification success rates, failure reasons
6. **Multi-factor Verification**: Combine multiple verification methods for higher confidence

---

## Support

For issues or questions:
1. Check this documentation
2. Review code comments in service files
3. Check logs in `/logs` directory
4. Contact the development team

---

## API Reference

Full API documentation is available at:
```
http://localhost:5000/api-docs
```
(Swagger UI with interactive API testing)

---

## License

Proprietary - FarmShare Technologies Limited

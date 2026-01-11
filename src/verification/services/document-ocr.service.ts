// src/verification/services/document-ocr.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createWorker, Worker } from 'tesseract.js';

export interface ExtractedDocumentData {
  success: boolean;
  fullName?: string;
  documentNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  issuedDate?: string;
  expiryDate?: string;
  documentType?:
    | 'NIN'
    | 'PASSPORT'
    | 'DRIVERS_LICENSE'
    | 'VOTER_CARD'
    | 'UNKNOWN';
  rawText?: string;
  confidence?: number;
  error?: string;
  message?: string;
}

@Injectable()
export class DocumentOcrService {
  private readonly logger = new Logger(DocumentOcrService.name);
  private worker: Worker | null = null;
  private readonly MIN_CONFIDENCE = 60; // Minimum acceptable OCR confidence

  /**
   * Initialize Tesseract worker (can be called on service initialization)
   */
  async initializeWorker(): Promise<void> {
    if (this.worker) return;

    try {
      this.logger.log('Initializing Tesseract OCR worker...');
      this.worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            this.logger.debug(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        },
      });
      this.logger.log('Tesseract OCR worker initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Tesseract worker', error);
      throw error;
    }
  }

  /**
   * Terminate Tesseract worker (cleanup)
   */
  async terminateWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.logger.log('Tesseract OCR worker terminated');
    }
  }

  /**
   * Extract data from a government-issued ID document using OCR
   * @param imageBuffer - Buffer containing the ID document image
   * @returns ExtractedDocumentData with parsed information
   */
  async extractDocumentData(
    imageBuffer: Buffer,
  ): Promise<ExtractedDocumentData> {
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new BadRequestException('Image buffer is empty or invalid');
    }

    // Check file size (max 5MB)
    if (imageBuffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException(
        'Image file too large. Maximum size is 5MB.',
      );
    }

    let worker: Worker | null = null;
    const shouldCleanup = !this.worker;

    try {
      this.logger.log(
        `Starting OCR extraction for document (${(imageBuffer.length / 1024).toFixed(2)} KB)`,
      );

      // Use persistent worker if available, otherwise create temporary one
      worker = this.worker || (await createWorker('eng'));

      const startTime = Date.now();
      const { data } = await worker.recognize(imageBuffer);
      const processingTime = Date.now() - startTime;

      const rawText = data.text;
      const confidence = data.confidence;

      this.logger.log(
        `OCR complete in ${processingTime}ms. Confidence: ${confidence.toFixed(2)}%`,
      );

      // Check if confidence is too low
      if (confidence < this.MIN_CONFIDENCE) {
        return {
          success: false,
          confidence: Math.round(confidence),
          rawText,
          error: 'Low OCR confidence',
          message:
            'Document text could not be read clearly. Please upload a clearer, well-lit image.',
        };
      }

      // Detect document type and extract data
      const documentType = this.detectDocumentType(rawText);
      const extractedData = this.parseDocumentText(rawText, documentType);

      // Validate extracted data
      const validationResult = this.validateExtractedData(
        extractedData,
        documentType ?? 'NIN',
      );

      if (!validationResult.isValid) {
        return {
          success: false,
          documentType,
          rawText,
          confidence: Math.round(confidence),
          error: 'Incomplete data extraction',
          message:
            validationResult.message ||
            'Could not extract all required information from the document.',
        };
      }

      return {
        success: true,
        fullName: extractedData.fullName,
        documentNumber: extractedData.documentNumber,
        dateOfBirth: extractedData.dateOfBirth,
        gender: extractedData.gender,
        issuedDate: extractedData.issuedDate,
        expiryDate: extractedData.expiryDate,
        documentType,
        rawText,
        confidence: Math.round(confidence),
        message: 'Document data extracted successfully',
      };
    } catch (error) {
      this.logger.error(`OCR extraction failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message || 'OCR processing failed',
        message:
          'Failed to process document image. Please ensure the image is clear and try again.',
      };
    } finally {
      // Clean up temporary worker
      if (shouldCleanup && worker) {
        await worker.terminate();
      }
    }
  }

  /**
   * Detect the type of document from OCR text
   */
  private detectDocumentType(
    text: string,
  ): ExtractedDocumentData['documentType'] {
    const textLower = text.toLowerCase();

    // Nigerian National Identity Number (NIN)
    if (
      textLower.includes('national identity') ||
      textLower.includes('nin') ||
      textLower.includes('nimc') ||
      /\b\d{11}\b/.test(text)
    ) {
      return 'NIN';
    }

    // Passport
    if (
      textLower.includes('passport') ||
      textLower.includes('nigerian passport') ||
      /passport\s*no/i.test(text)
    ) {
      return 'PASSPORT';
    }

    // Driver's License
    if (
      textLower.includes('driver') ||
      textLower.includes('license') ||
      textLower.includes('licence') ||
      textLower.includes('frsc')
    ) {
      return 'DRIVERS_LICENSE';
    }

    // Voter's Card
    if (
      textLower.includes('voter') ||
      textLower.includes('inec') ||
      textLower.includes('permanent voter')
    ) {
      return 'VOTER_CARD';
    }

    return 'UNKNOWN';
  }

  /**
   * Parse document text and extract structured data
   */
  private parseDocumentText(
    text: string,
    docType: ExtractedDocumentData['documentType'],
  ): Partial<ExtractedDocumentData> {
    return {
      fullName: this.extractName(text, docType ?? ''),
      documentNumber: this.extractDocumentNumber(text, docType ?? ''),
      dateOfBirth: this.extractDateOfBirth(text),
      gender: this.extractGender(text),
      issuedDate: this.extractIssuedDate(text),
      expiryDate: this.extractExpiryDate(text),
    };
  }

  /**
   * Extract person's name from document text
   */
  private extractName(text: string, docType: string): string | undefined {
    const patterns = [
      // "Name: JOHN DOE"
      /(?:name|full\s*name|surname|last\s*name)[\s:]+([A-Z][A-Z\s]+?)(?:\n|$|[0-9])/i,
      // "JOHN DOE" (capitalized words)
      /\b([A-Z][A-Z]+(?:\s+[A-Z][A-Z]+){1,3})\b/,
      // "John Doe Smith" (title case)
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const name = this.normalizeName(match[1]);
        // Validate name (at least 2 words, each > 1 char)
        const words = name.split(' ');
        if (words.length >= 2 && words.every((w) => w.length > 1)) {
          return name;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract document number (NIN, Passport No, License No, etc.)
   */
  private extractDocumentNumber(
    text: string,
    docType: string,
  ): string | undefined {
    if (docType === 'NIN') {
      // Nigerian NIN is 11 digits
      const ninPattern = /\b(\d{11})\b/;
      const match = text.match(ninPattern);
      return match ? match[1] : undefined;
    }

    if (docType === 'PASSPORT') {
      // Nigerian passport format: A12345678 or similar
      const passportPattern = /\b([A-Z]\d{8})\b/;
      const match = text.match(passportPattern);
      return match ? match[1] : undefined;
    }

    if (docType === 'DRIVERS_LICENSE') {
      // Nigerian driver's license format varies
      const licensePattern = /\b([A-Z]{3}\d{6,9}[A-Z]{2})\b/;
      const match = text.match(licensePattern);
      return match ? match[1] : undefined;
    }

    // Generic alphanumeric ID
    const genericPattern = /\b([A-Z0-9]{8,15})\b/;
    const match = text.match(genericPattern);
    return match ? match[1] : undefined;
  }

  /**
   * Extract date of birth
   */
  private extractDateOfBirth(text: string): string | undefined {
    const patterns = [
      // DD/MM/YYYY or DD-MM-YYYY
      /(?:date\s*of\s*birth|dob|birth\s*date)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
      // Standalone date
      /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/,
      // YYYY-MM-DD (ISO format)
      /\b(\d{4})-(\d{2})-(\d{2})\b/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return this.normalizeDate(match[0]);
      }
    }

    return undefined;
  }

  /**
   * Extract gender
   */
  private extractGender(text: string): string | undefined {
    const malePattern = /\b(male|m)\b/i;
    const femalePattern = /\b(female|f)\b/i;

    if (malePattern.test(text)) return 'M';
    if (femalePattern.test(text)) return 'F';

    return undefined;
  }

  /**
   * Extract issue date
   */
  private extractIssuedDate(text: string): string | undefined {
    const patterns = [
      /(?:issue|issued\s*date|date\s*of\s*issue)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return this.normalizeDate(match[1]);
      }
    }

    return undefined;
  }

  /**
   * Extract expiry date
   */
  private extractExpiryDate(text: string): string | undefined {
    const patterns = [
      /(?:expir[ye]|expiry\s*date|valid\s*until)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return this.normalizeDate(match[1]);
      }
    }

    return undefined;
  }

  /**
   * Normalize a name to title case
   */
  private normalizeName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Normalize date to DD/MM/YYYY format
   */
  private normalizeDate(dateStr: string): string {
    const parts = dateStr.match(/\d+/g);
    if (!parts || parts.length < 3) return dateStr;

    let [part1, part2, part3] = parts;

    // Handle YYYY-MM-DD format
    if (part1.length === 4) {
      return `${part3.padStart(2, '0')}/${part2.padStart(2, '0')}/${part1}`;
    }

    // Handle DD/MM/YYYY or MM/DD/YYYY format
    return `${part1.padStart(2, '0')}/${part2.padStart(2, '0')}/${part3}`;
  }

  /**
   * Validate that essential data was extracted
   */
  private validateExtractedData(
    data: Partial<ExtractedDocumentData>,
    docType: string,
  ): { isValid: boolean; message?: string } {
    // Name is always required
    if (!data.fullName) {
      return {
        isValid: false,
        message: 'Could not extract name from document',
      };
    }

    // Document number is required for most types
    if (docType !== 'UNKNOWN' && !data.documentNumber) {
      return {
        isValid: false,
        message: 'Could not extract document number',
      };
    }

    // Date of birth is highly recommended
    if (!data.dateOfBirth) {
      this.logger.warn('Date of birth not extracted, but allowing...');
    }

    return { isValid: true };
  }
}

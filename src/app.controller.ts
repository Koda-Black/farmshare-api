import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller()
@ApiTags('App')
export class AppController {
  @Get()
  redirectToDocs(@Res() res: Response) {
    return res.redirect('/swagger'); // Redirects only `/` to Swagger
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint for deployment platforms' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}

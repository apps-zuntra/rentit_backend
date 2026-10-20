// property.controller.ts
// ─────────────────────────────────────────────────────────────────────────────
// ✅ POST /:id/view — recordView placed BEFORE the wildcard GET /:id
//    so NestJS routing doesn't confuse it with getProperty
// ─────────────────────────────────────────────────────────────────────────────

import {
  Controller,
  Post,
  Put,
  Get,
  Param,
  Patch,
  Body,
  Req,
  UseGuards,
  Query,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';

import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { PropertyService } from './property.service';
import { CreateBasicDto } from './dto/create-basic.dto';
import { CreateDetailsDto } from './dto/create-details.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import {
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
} from '@nestjs/common';
import { UpdateLocationDto } from './dto/location.dto';
import { uploadToR2 } from '../common/s3.upload';
import { CreateAmenitiesDto } from './dto/create-amenities.dto';
import { CreateScheduleDto } from './dto/availability.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';

@Controller('property')
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  // ============================================================
  // CREATE BASIC
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @Post('basic')
  createBasic(@Req() req, @Body() dto: CreateBasicDto) {
    return this.propertyService.createBasic(req.user.userId, dto);
  }

  // ============================================================
  // LOCATION
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @Put('location/:id')
  updateLocation(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.propertyService.updateLocation(
      Number(id),
      req.user.userId,
      dto,
    );
  }

  // ============================================================
  // DETAILS
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @Put(':id/details')
  updateDetails(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: CreateDetailsDto,
  ) {
    return this.propertyService.updateDetails(
      Number(id),
      req.user.userId,
      dto,
    );
  }

  // ============================================================
  // STATS (views + enquiries for a single property)
  // ============================================================
  @Get('stats/:id')
  getStats(@Param('id') id: string) {
    const numId = Number(id);
    if (!numId || isNaN(numId)) {
      throw new BadRequestException('Invalid property ID');
    }
    return this.propertyService.getPropertyStats(numId);
  }

  // ============================================================
  // RECOMMEND
  // ============================================================
  @Get('recommend/:userId')
  getRecommended(
    @Param('userId') userId: string,
    @Query('city') city?: string,
  ) {
    return this.propertyService.getRecommended(Number(userId), city);
  }

  // ============================================================
  // UPLOAD IMAGES
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @Post(':id/upload-images')
  @UseInterceptors(FilesInterceptor('files'))
  async uploadImages(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('existingImages') existingImages: string,
    @Req() req,
  ) {
    const oldImages = existingImages ? JSON.parse(existingImages) : [];
    const newUrls: string[] = [];

    for (const file of files) {
      const url = await uploadToR2(file);
      newUrls.push(url);
    }

    return this.propertyService.saveImages(Number(id), req.user.userId, [
      ...oldImages,
      ...newUrls,
    ]);
  }

  // ============================================================
  // UPLOAD VIDEO
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @Post(':id/upload-video')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }),
  )
  async uploadVideo(
    @Param('id') id: string,
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No video file');
    const url = await uploadToR2(file);
    return this.propertyService.saveVideo(Number(id), req.user.userId, url);
  }

  // ============================================================
  // CONTACT
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @Put(':id/contact')
  updateContact(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: CreateContactDto,
  ) {
    return this.propertyService.updateContact(
      Number(id),
      req.user.userId,
      dto,
    );
  }

  // ============================================================
  // VERIFY
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @Put(':id/verify')
  verifyProperty(@Param('id') id: string, @Req() req) {
    return this.propertyService.verifyProperty(Number(id), req.user.userId);
  }

  // ============================================================
  // GET ALL (with city filter + viewscount in response)
  // ============================================================
  @UseGuards(OptionalJwtAuthGuard)
  @Get('all')
  getAllProperties(@Req() req, @Query('city') city?: string) {
    const userId = req.user?.userId;
    return this.propertyService.getAllProperties(userId, city);
  }

  // ============================================================
  // MY PROPERTIES
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @Get('my')
  getMyProperties(@Req() req) {
    return this.propertyService.getMyProperties(req.user.userId);
  }

  // ============================================================
  // AMENITIES
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @Put(':id/amenities')
  updateAmenities(
    @Param('id', ParseIntPipe) id: number,
    @Req() req,
    @Body() dto: CreateAmenitiesDto,
  ) {
    return this.propertyService.updateAmenities(id, req.user.userId, dto);
  }

  // ============================================================
  // DELETE
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @Put(':id/delete')
  deleteProperty(@Param('id') id: string, @Req() req) {
    return this.propertyService.deleteProperty(Number(id), req.user.userId);
  }

  // ============================================================
  // RECORD VIEW
  // ✅ POST /:id/view — must be declared BEFORE the wildcard GET /:id
  //    to avoid NestJS routing conflicts
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @Post(':id/view')
  recordView(
  @Param('id', ParseIntPipe) id: number,
  @Req() req,
) {
  return this.propertyService.recordView(id, req.user.userId);
}

  // ============================================================
  // SINGLE PROPERTY — KEEP THIS LAST
  // Wildcard GET /:id would swallow /all /my /stats etc. if placed earlier
  // ============================================================
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  getProperty(@Param('id') id: string) {
    const numId = Number(id);
    if (!numId || isNaN(numId)) {
      throw new BadRequestException('Invalid property ID');
    }
    return this.propertyService.getProperty(numId);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/availability')
  updateAvailability(
    @Param('id', ParseIntPipe) id: number,
    @Req() req,
    @Body() dto: CreateScheduleDto,
  ) {
    return this.propertyService.updateSchedule(
      id,
      req.user.userId,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/soldout')
  markSoldOut(
    @Param('id', ParseIntPipe) id: number,
    @Req() req,
    @Body() body: { reason: string },
  ) {
    console.log('PROPERTY ID =>', id);
    console.log('USER =>', req.user);
    console.log('BODY =>', body);

    return this.propertyService.markSoldOut(
      id,
      req.user.userId,
      body.reason,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  updateProperty(
    @Param('id', ParseIntPipe) id: number,
    @Req() req,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.propertyService.updateProperty(
      id,
      req.user.userId,
      dto,
    );
  }
  
}
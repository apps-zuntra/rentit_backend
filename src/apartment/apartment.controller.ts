// apartment.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
} from '@nestjs/common';
import {
  FileInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';

import { ApartmentService } from './apartment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { CreateApartmentDto } from './dto/create-apartment.dto';
import { UpdateApartmentDto } from './dto/update-apartment.dto';
import { AdditionalDetailsDto } from './dto/additional-details.dto';
import { ApartmentDto } from './dto/apartment.dto';

import { uploadToR2 } from '../common/s3.upload';

@Controller('apartment')
export class ApartmentController {
  constructor(
    private readonly apartmentService: ApartmentService,
  ) {}

  private getUserId(req: any): number {
    const uid = req.user?.userId ?? req.user?.id;
    if (!uid) {
      throw new BadRequestException('User not found in request');
    }
    return Number(uid);
  }

  // =========================================================
  // CREATE APARTMENT
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body() dto: CreateApartmentDto,
    @Req() req,
  ) {
    const userId = this.getUserId(req);
    return this.apartmentService.createApartment(dto, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  getMyApartments(@Req() req) {
    const userId = this.getUserId(req);
    return this.apartmentService.getMyApartments(userId);
  }

  // =========================================================
  // GET ALL APARTMENTS
  // =========================================================
  @Get()
  findAll() {
    return this.apartmentService.getAllApartments();
  }

  // =========================================================
  // GET SINGLE APARTMENT
  // =========================================================
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.apartmentService.getApartment(id);
  }

  // =========================================================
  // UPDATE APARTMENT
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateApartmentDto,
    @Req() req,
  ) {
    const userId = this.getUserId(req);
    console.log('REQ USER =>', req.user);
    console.log('EXTRACTED USER ID =>', userId);
    console.log('APARTMENT ID =>', id);

    return this.apartmentService.updateApartment(id, dto, userId);
  }

  // =========================================================
  // ADDITIONAL DETAILS
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Put(':id/additional-details')
  additionalDetails(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdditionalDetailsDto,
    @Req() req,
  ) {
    const userId = this.getUserId(req);
    return this.apartmentService.additionalDetails(id, dto, userId);
  }

  // =========================================================
  // UPLOAD IMAGES
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Post(':id/upload-images')
  @UseInterceptors(FilesInterceptor('files'))
  async uploadImages(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('existingImages') existingImages: string,
    @Req() req,
  ) {
    const userId = this.getUserId(req);
    const oldImages: string[] = existingImages
      ? JSON.parse(existingImages)
      : [];

    const newUrls: string[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        const url = await uploadToR2(file);
        newUrls.push(url);
      }
    }

    return this.apartmentService.saveImages(
      id,
      userId,
      [...oldImages, ...newUrls],
    );
  }

  // =========================================================
  // UPLOAD VIDEO
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Post(':id/upload-video')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
      },
    }),
  )
  async uploadVideo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req,
  ) {
    const userId = this.getUserId(req);
    if (!file) {
      throw new BadRequestException('No video file uploaded');
    }

    const url = await uploadToR2(file);

    return this.apartmentService.saveVideo(id, userId, url);
  }

  // =========================================================
  // SAVE AVAILABILITY
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Put(':id/availability')
  saveAvailability(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApartmentDto,
    @Req() req,
  ) {
    const userId = this.getUserId(req);
    return this.apartmentService.saveAvailability(id, userId, dto);
  }

  // =========================================================
  // VIEW COUNT — AUTH REQUIRED, one view per user per property
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Post(':id/view')
  recordView(
    @Param('id', ParseIntPipe) id: number,
    @Req() req,
  ) {
    const userId = this.getUserId(req);
    return this.apartmentService.recordUniqueView(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/soldout')
  markSoldOut(
    @Param('id', ParseIntPipe) id: number,
    @Req() req,
    @Body() body: { reason: string },
  ) {
    const userId = this.getUserId(req);
    return this.apartmentService.markSoldOut(
      id,
      userId,
      body.reason,
    );
  }
}
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { ConfigModule } from "@nestjs/config";

import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { PropertyModule } from "./property/property.module";
import { LikeModule } from "./like/like.module";
import { UserModule } from "./user/user.module";
import { PaymentModule } from "./payment/payment.module";
import { VisitModule } from "./visit/visit.module";
import { ChatModule } from "./chat/chat.module";
import { IvrModule } from "./ivr/ivr.module";
import { AiModule } from "./ai/ai.module"; // 🔥 ADD THIS
import { SpeechModule } from "./speech/speech.module";
import { UserPreferenceModule } from "./user-preference/user-preference.module";
import { ApartmentModule } from "./apartment/apartment.module";
import { CommercialModule } from "./commercial/commercial.module";
import { FlatmateModule } from './flatmate/flatmate.module';
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

@Module({
  controllers: [AppController],
  providers: [AppService],
  imports: [
    /// 🔥 ENV CONFIG (VERY IMPORTANT)
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    /// 🔥 SCHEDULER
    ScheduleModule.forRoot(),

    /// 🔥 CORE MODULES
    PrismaModule,

    AuthModule,
    UserModule,
    PropertyModule,
    LikeModule,
    PaymentModule,
    VisitModule,
    ChatModule,
    IvrModule,
    
    UserPreferenceModule,
    /// 🧠 AI MODULE (NEW)
    AiModule,
    SpeechModule,
    
    ApartmentModule,
    CommercialModule,
    FlatmateModule,
  ],
})
export class AppModule {}
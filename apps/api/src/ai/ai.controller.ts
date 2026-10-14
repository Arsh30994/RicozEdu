import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@ricozedu/shared-auth';
import { z } from 'zod';
import { ApiError, rejectBodyTenantId } from '../common/api-error';
import {
  AuthUser,
  CorrelationId,
  CurrentUser,
  MembershipId,
  TenantId,
} from '../common/request-context';
import { RequirePermissions } from '../iam/permission.guard';
import { AiService } from './ai.service';
import { AiRequestContext } from './ai.types';

const AskSchema = z.object({
  message: z.string().trim().min(2).max(4000),
  conversationId: z.string().uuid().optional(),
  agent: z.boolean().optional(),
  academicContext: z
    .object({
      studentMembershipId: z.string().uuid().optional(),
      programmeEnrolmentId: z.string().uuid().optional(),
      courseVersionId: z.string().uuid().optional(),
    })
    .optional(),
});

const IngestTextSchema = z.object({
  title: z.string().trim().min(1).max(240),
  content: z.string().trim().min(20).max(1_000_000),
  sourceType: z.enum(['text', 'markdown']).default('text'),
});

const FlashcardsSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1).max(8),
  topic: z.string().trim().max(240).optional(),
});

const QuizSchema = FlashcardsSchema.extend({ questionCount: z.number().int().min(2).max(10).default(5) });

const PlanSchema = z.object({
  subjects: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
  targetDate: z.string().date(),
  minutesPerDay: z.number().int().min(15).max(480),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError('VALIDATION', 'Invalid AI request', HttpStatus.BAD_REQUEST, result.error.flatten());
  }
  return result.data;
}

@ApiTags('ai')
@Controller('v1/ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('chat')
  @RequirePermissions(PERMISSIONS.AI_USE)
  async chat(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @MembershipId() membershipId: string,
    @CorrelationId() correlationId: string,
    @Body() body: unknown,
  ) {
    rejectBodyTenantId(body);
    return this.ai.chat(this.context(tenantId, user, membershipId, correlationId), parse(AskSchema, body));
  }

  @Get('conversations')
  @RequirePermissions(PERMISSIONS.AI_USE)
  listConversations(@TenantId() tenantId: string, @CurrentUser() user: AuthUser) {
    return this.ai.listConversations(tenantId, user.userId);
  }

  @Get('conversations/:id')
  @RequirePermissions(PERMISSIONS.AI_USE)
  getConversation(@TenantId() tenantId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ai.getConversation(tenantId, user.userId, id);
  }

  @Get('documents')
  @RequirePermissions(PERMISSIONS.AI_USE)
  listDocuments(@TenantId() tenantId: string) {
    return this.ai.listDocuments(tenantId);
  }

  @Post('documents/text')
  @RequirePermissions(PERMISSIONS.AI_DOCUMENT_MANAGE)
  async ingestText(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @MembershipId() membershipId: string,
    @CorrelationId() correlationId: string,
    @Body() body: unknown,
  ) {
    rejectBodyTenantId(body);
    const input = parse(IngestTextSchema, body);
    return this.ai.ingestText(this.context(tenantId, user, membershipId, correlationId), {
      ...input,
      sourceType: input.sourceType ?? 'text',
    });
  }

  @Post('documents/upload')
  @ApiConsumes('multipart/form-data')
  @RequirePermissions(PERMISSIONS.AI_DOCUMENT_MANAGE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async uploadDocument(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @MembershipId() membershipId: string,
    @CorrelationId() correlationId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new ApiError('VALIDATION', 'A document file is required', HttpStatus.BAD_REQUEST);
    return this.ai.ingestFile(this.context(tenantId, user, membershipId, correlationId), file);
  }

  @Delete('documents/:id')
  @RequirePermissions(PERMISSIONS.AI_DOCUMENT_MANAGE)
  deleteDocument(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @MembershipId() membershipId: string,
    @CorrelationId() correlationId: string,
    @Param('id') id: string,
  ) {
    return this.ai.deleteDocument(this.context(tenantId, user, membershipId, correlationId), id);
  }

  @Post('study/flashcards')
  @RequirePermissions(PERMISSIONS.AI_STUDY_USE)
  async flashcards(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @MembershipId() membershipId: string,
    @CorrelationId() correlationId: string,
    @Body() body: unknown,
  ) {
    rejectBodyTenantId(body);
    return this.ai.createFlashcards(this.context(tenantId, user, membershipId, correlationId), parse(FlashcardsSchema, body));
  }

  @Post('study/quiz')
  @RequirePermissions(PERMISSIONS.AI_STUDY_USE)
  async quiz(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @MembershipId() membershipId: string,
    @CorrelationId() correlationId: string,
    @Body() body: unknown,
  ) {
    rejectBodyTenantId(body);
    const input = parse(QuizSchema, body);
    return this.ai.createQuiz(this.context(tenantId, user, membershipId, correlationId), {
      ...input,
      questionCount: input.questionCount ?? 5,
    });
  }

  @Post('study/plan')
  @RequirePermissions(PERMISSIONS.AI_STUDY_USE)
  async plan(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @MembershipId() membershipId: string,
    @CorrelationId() correlationId: string,
    @Body() body: unknown,
  ) {
    rejectBodyTenantId(body);
    return this.ai.createRevisionPlan(this.context(tenantId, user, membershipId, correlationId), parse(PlanSchema, body));
  }

  @Post('transcribe')
  @RequirePermissions(PERMISSIONS.AI_USE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  transcribe(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new ApiError('VALIDATION', 'An audio file is required', HttpStatus.BAD_REQUEST);
    return this.ai.transcribe(file);
  }

  private context(tenantId: string, user: AuthUser, membershipId: string, correlationId: string): AiRequestContext {
    return {
      tenantId,
      userId: user.userId,
      membershipId,
      authorizationVersion: user.authorizationVersion,
      correlationId,
    };
  }
}

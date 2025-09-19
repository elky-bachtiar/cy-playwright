import { Router, Request, Response } from 'express';
import { ReportingService } from '../../services/reporting.service';
import { ValidationMiddleware } from '../middleware/validation';
import { AsyncHandler } from '../middleware/async-handler';

export class ReportingRouter {
  public router: Router;
  private reportingService: ReportingService;

  constructor() {
    this.router = Router();
    this.reportingService = new ReportingService();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Get conversion report
    this.router.get(
      '/conversion/:jobId',
      ValidationMiddleware.validateJobId(),
      AsyncHandler.wrap(this.getConversionReport.bind(this))
    );

    // Download conversion report
    this.router.get(
      '/conversion/:jobId/download',
      ValidationMiddleware.validateJobId(),
      AsyncHandler.wrap(this.downloadConversionReport.bind(this))
    );

    // Get conversion summary
    this.router.get(
      '/summary',
      AsyncHandler.wrap(this.getConversionSummary.bind(this))
    );

    // Get analytics and metrics
    this.router.get(
      '/analytics',
      AsyncHandler.wrap(this.getAnalytics.bind(this))
    );

    // Generate custom report
    this.router.post(
      '/custom',
      AsyncHandler.wrap(this.generateCustomReport.bind(this))
    );

    // Get custom report status
    this.router.get(
      '/custom/:reportId',
      AsyncHandler.wrap(this.getCustomReportStatus.bind(this))
    );

    // Download custom report
    this.router.get(
      '/custom/:reportId/download',
      AsyncHandler.wrap(this.downloadCustomReport.bind(this))
    );

    // Get report templates
    this.router.get(
      '/templates',
      AsyncHandler.wrap(this.getReportTemplates.bind(this))
    );

    // Export data for external tools
    this.router.get(
      '/export',
      AsyncHandler.wrap(this.exportData.bind(this))
    );

    // Get report history
    this.router.get(
      '/history',
      ValidationMiddleware.validatePagination(),
      AsyncHandler.wrap(this.getReportHistory.bind(this))
    );
  }

  private async getConversionReport(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;
    const { format = 'json', includeDetails = 'true' } = req.query;

    try {
      const report = await this.reportingService.getConversionReport(jobId, {
        format: format as string,
        includeDetails: includeDetails === 'true'
      });

      if (report.status === 'processing') {
        res.status(202).json(report);
      } else {
        res.json(report);
      }
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Conversion job not found',
          code: 'CONVERSION_JOB_NOT_FOUND'
        });
      } else {
        throw error;
      }
    }
  }

  private async downloadConversionReport(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;
    const { format = 'pdf' } = req.query;

    const supportedFormats = ['pdf', 'excel', 'json', 'html'];
    if (!supportedFormats.includes(format as string)) {
      return res.status(400).json({
        error: 'Unsupported report format',
        code: 'UNSUPPORTED_FORMAT',
        supportedFormats
      });
    }

    try {
      let reportBuffer: Buffer;
      let contentType: string;
      let filename: string;

      switch (format) {
        case 'pdf':
          reportBuffer = await this.reportingService.generateReportPdf(jobId);
          contentType = 'application/pdf';
          filename = `conversion-report-${jobId}.pdf`;
          break;
        case 'excel':
          reportBuffer = await this.reportingService.generateReportExcel(jobId);
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          filename = `conversion-report-${jobId}.xlsx`;
          break;
        case 'html':
          reportBuffer = await this.reportingService.generateReportHtml(jobId);
          contentType = 'text/html';
          filename = `conversion-report-${jobId}.html`;
          break;
        case 'json':
        default:
          const jsonReport = await this.reportingService.getConversionReport(jobId);
          reportBuffer = Buffer.from(JSON.stringify(jsonReport, null, 2));
          contentType = 'application/json';
          filename = `conversion-report-${jobId}.json`;
          break;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', reportBuffer.length);

      res.send(reportBuffer);
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Conversion job not found',
          code: 'CONVERSION_JOB_NOT_FOUND'
        });
      } else {
        throw error;
      }
    }
  }

  private async getConversionSummary(req: Request, res: Response): Promise<void> {
    const {
      startDate,
      endDate,
      groupBy = 'day',
      includeDetails = 'false'
    } = req.query;

    try {
      const summary = await this.reportingService.getConversionSummary({
        startDate: startDate as string,
        endDate: endDate as string,
        groupBy: groupBy as string,
        includeDetails: includeDetails === 'true'
      });

      res.json(summary);
    } catch (error) {
      if (error.message.includes('Invalid date')) {
        res.status(400).json({
          error: 'Invalid date format',
          code: 'INVALID_DATE_FORMAT'
        });
      } else {
        throw error;
      }
    }
  }

  private async getAnalytics(req: Request, res: Response): Promise<void> {
    const {
      timeRange = '30d',
      metrics = 'all',
      includeHistory = 'false'
    } = req.query;

    const validTimeRanges = ['1d', '7d', '30d', '90d', '365d'];
    if (!validTimeRanges.includes(timeRange as string)) {
      return res.status(400).json({
        error: 'Invalid time range',
        code: 'INVALID_TIME_RANGE',
        validRanges: validTimeRanges
      });
    }

    try {
      const analytics = await this.reportingService.getAnalytics({
        timeRange: timeRange as string,
        metrics: metrics as string,
        includeHistory: includeHistory === 'true'
      });

      res.json(analytics);
    } catch (error) {
      throw error;
    }
  }

  private async generateCustomReport(req: Request, res: Response): Promise<void> {
    const {
      name,
      filters,
      metrics,
      format = 'pdf',
      groupBy,
      templateId
    } = req.body;

    // Validate required fields
    if (!name || !filters || !metrics) {
      return res.status(400).json({
        error: 'Name, filters, and metrics are required',
        code: 'VALIDATION_ERROR'
      });
    }

    try {
      const customReport = await this.reportingService.generateCustomReport({
        name,
        filters,
        metrics,
        format,
        groupBy,
        templateId
      });

      res.status(202).json(customReport);
    } catch (error) {
      if (error.message.includes('Invalid template')) {
        res.status(400).json({
          error: 'Invalid report template',
          code: 'INVALID_TEMPLATE'
        });
      } else {
        throw error;
      }
    }
  }

  private async getCustomReportStatus(req: Request, res: Response): Promise<void> {
    const { reportId } = req.params;

    try {
      const status = await this.reportingService.getCustomReportStatus(reportId);

      if (status.status === 'processing') {
        res.status(202).json(status);
      } else {
        res.json(status);
      }
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Custom report not found',
          code: 'CUSTOM_REPORT_NOT_FOUND'
        });
      } else {
        throw error;
      }
    }
  }

  private async downloadCustomReport(req: Request, res: Response): Promise<void> {
    const { reportId } = req.params;

    try {
      const reportInfo = await this.reportingService.getCustomReportStatus(reportId);

      if (reportInfo.status !== 'completed') {
        return res.status(400).json({
          error: 'Report not yet completed',
          code: 'REPORT_NOT_COMPLETED',
          currentStatus: reportInfo.status
        });
      }

      const reportBuffer = await this.reportingService.downloadCustomReport(reportId);
      const contentType = this.getContentType(reportInfo.format);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${reportInfo.name}.${reportInfo.format}"`);
      res.setHeader('Content-Length', reportBuffer.length);

      res.send(reportBuffer);
    } catch (error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Custom report not found',
          code: 'CUSTOM_REPORT_NOT_FOUND'
        });
      } else if (error.message.includes('expired')) {
        res.status(410).json({
          error: 'Report has expired and is no longer available',
          code: 'REPORT_EXPIRED'
        });
      } else {
        throw error;
      }
    }
  }

  private async getReportTemplates(req: Request, res: Response): Promise<void> {
    try {
      const templates = await this.reportingService.getReportTemplates();
      res.json(templates);
    } catch (error) {
      throw error;
    }
  }

  private async exportData(req: Request, res: Response): Promise<void> {
    const {
      dataType = 'conversions',
      format = 'csv',
      startDate,
      endDate,
      filters
    } = req.query;

    const supportedFormats = ['csv', 'json', 'excel'];
    const supportedDataTypes = ['conversions', 'analytics', 'repositories', 'issues'];

    if (!supportedFormats.includes(format as string)) {
      return res.status(400).json({
        error: 'Unsupported export format',
        code: 'UNSUPPORTED_FORMAT',
        supportedFormats
      });
    }

    if (!supportedDataTypes.includes(dataType as string)) {
      return res.status(400).json({
        error: 'Unsupported data type',
        code: 'UNSUPPORTED_DATA_TYPE',
        supportedDataTypes
      });
    }

    try {
      const exportData = await this.reportingService.exportData({
        dataType: dataType as string,
        format: format as string,
        startDate: startDate as string,
        endDate: endDate as string,
        filters: filters ? JSON.parse(filters as string) : {}
      });

      const contentType = this.getContentType(format as string);
      const filename = `${dataType}-export-${new Date().toISOString().split('T')[0]}.${format}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      if (format === 'json') {
        res.json(exportData);
      } else {
        res.send(exportData);
      }
    } catch (error) {
      if (error.message.includes('Invalid filters')) {
        res.status(400).json({
          error: 'Invalid filter format',
          code: 'INVALID_FILTERS'
        });
      } else {
        throw error;
      }
    }
  }

  private async getReportHistory(req: Request, res: Response): Promise<void> {
    const {
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      type
    } = req.query;

    try {
      const history = await this.reportingService.getReportHistory({
        limit: Number(limit),
        offset: Number(offset),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        type: type as string
      });

      res.json({
        reports: history.items,
        pagination: {
          total: history.total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: history.total > Number(offset) + Number(limit)
        }
      });
    } catch (error) {
      throw error;
    }
  }

  private getContentType(format: string): string {
    const contentTypes = {
      'pdf': 'application/pdf',
      'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'csv': 'text/csv',
      'json': 'application/json',
      'html': 'text/html'
    };

    return contentTypes[format] || 'application/octet-stream';
  }
}
import { Logger } from '../utils/logger';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface CIMigrationResult {
  originalPipeline: string;
  convertedPipeline: string;
  migrationSummary: {
    stepsConverted: number;
    jobsConverted: number;
    environmentVariablesConverted: number;
    artifactsConverted: number;
  };
  warnings: string[];
  errors: string[];
  recommendations: string[];
}

export interface CIPipelineAnalysis {
  type: 'github-actions' | 'circleci' | 'azure-pipelines' | 'jenkins' | 'gitlab-ci';
  version: string;
  jobs: any[];
  steps: any[];
  environmentVariables: Record<string, string>;
  artifacts: string[];
  triggers: any[];
}

export class CIMigrationAnalyzer {
  private logger = new Logger('CIMigrationAnalyzer');

  async analyzeCIPipeline(pipelinePath: string): Promise<CIPipelineAnalysis> {
    this.logger.info(`Analyzing CI pipeline: ${pipelinePath}`);

    const pipelineContent = await fs.readFile(pipelinePath, 'utf-8');
    const pipelineType = this.detectPipelineType(pipelinePath, pipelineContent);

    let parsedPipeline: any;
    try {
      if (pipelineType === 'github-actions') {
        parsedPipeline = yaml.load(pipelineContent);
      } else {
        parsedPipeline = yaml.load(pipelineContent);
      }
    } catch (error) {
      this.logger.error(`Failed to parse pipeline: ${error}`);
      throw new Error(`Invalid pipeline configuration: ${error}`);
    }

    return {
      type: pipelineType,
      version: parsedPipeline.version || '1.0',
      jobs: this.extractJobs(parsedPipeline, pipelineType),
      steps: this.extractSteps(parsedPipeline, pipelineType),
      environmentVariables: this.extractEnvironmentVariables(parsedPipeline, pipelineType),
      artifacts: this.extractArtifacts(parsedPipeline, pipelineType),
      triggers: this.extractTriggers(parsedPipeline, pipelineType)
    };
  }

  async migratePipeline(
    sourcePipelinePath: string,
    targetPipelinePath: string,
    targetType: 'github-actions' | 'circleci' | 'azure-pipelines' = 'github-actions'
  ): Promise<CIMigrationResult> {
    this.logger.info(`Migrating pipeline from ${sourcePipelinePath} to ${targetPipelinePath}`);

    const analysis = await this.analyzeCIPipeline(sourcePipelinePath);
    const convertedPipeline = await this.convertPipeline(analysis, targetType);

    await fs.ensureDir(path.dirname(targetPipelinePath));
    await fs.writeFile(targetPipelinePath, convertedPipeline);

    const migrationSummary = {
      stepsConverted: analysis.steps.length,
      jobsConverted: analysis.jobs.length,
      environmentVariablesConverted: Object.keys(analysis.environmentVariables).length,
      artifactsConverted: analysis.artifacts.length
    };

    return {
      originalPipeline: sourcePipelinePath,
      convertedPipeline: targetPipelinePath,
      migrationSummary,
      warnings: [],
      errors: [],
      recommendations: [
        'Review converted pipeline for accuracy',
        'Test pipeline in staging environment',
        'Update any environment-specific configurations'
      ]
    };
  }

  private detectPipelineType(filePath: string, content: string): CIPipelineAnalysis['type'] {
    const fileName = path.basename(filePath);

    if (fileName.includes('.github') || fileName.includes('workflow')) {
      return 'github-actions';
    }
    if (fileName.includes('circle') || content.includes('version: 2')) {
      return 'circleci';
    }
    if (fileName.includes('azure') || content.includes('trigger:')) {
      return 'azure-pipelines';
    }
    if (fileName.includes('jenkins') || content.includes('pipeline {')) {
      return 'jenkins';
    }
    if (fileName.includes('gitlab') || content.includes('stages:')) {
      return 'gitlab-ci';
    }

    return 'github-actions'; // Default
  }

  private extractJobs(pipeline: any, type: CIPipelineAnalysis['type']): any[] {
    switch (type) {
      case 'github-actions':
        return pipeline.jobs ? Object.keys(pipeline.jobs).map(key => ({ name: key, ...pipeline.jobs[key] })) : [];
      case 'circleci':
        return pipeline.jobs ? Object.keys(pipeline.jobs).map(key => ({ name: key, ...pipeline.jobs[key] })) : [];
      default:
        return [];
    }
  }

  private extractSteps(pipeline: any, type: CIPipelineAnalysis['type']): any[] {
    const steps: any[] = [];

    if (type === 'github-actions' && pipeline.jobs) {
      Object.values(pipeline.jobs).forEach((job: any) => {
        if (job.steps) {
          steps.push(...job.steps);
        }
      });
    }

    return steps;
  }

  private extractEnvironmentVariables(pipeline: any, type: CIPipelineAnalysis['type']): Record<string, string> {
    const envVars: Record<string, string> = {};

    if (pipeline.env) {
      Object.assign(envVars, pipeline.env);
    }

    return envVars;
  }

  private extractArtifacts(pipeline: any, type: CIPipelineAnalysis['type']): string[] {
    const artifacts: string[] = [];

    if (type === 'github-actions' && pipeline.jobs) {
      Object.values(pipeline.jobs).forEach((job: any) => {
        if (job.steps) {
          job.steps.forEach((step: any) => {
            if (step.uses && step.uses.includes('upload-artifact')) {
              artifacts.push(step.with?.name || 'artifact');
            }
          });
        }
      });
    }

    return artifacts;
  }

  private extractTriggers(pipeline: any, type: CIPipelineAnalysis['type']): any[] {
    const triggers: any[] = [];

    if (pipeline.on) {
      if (typeof pipeline.on === 'string') {
        triggers.push({ type: pipeline.on });
      } else if (Array.isArray(pipeline.on)) {
        triggers.push(...pipeline.on.map((trigger: string) => ({ type: trigger })));
      } else {
        Object.keys(pipeline.on).forEach(key => {
          triggers.push({ type: key, config: pipeline.on[key] });
        });
      }
    }

    return triggers;
  }

  private async convertPipeline(analysis: CIPipelineAnalysis, targetType: CIPipelineAnalysis['type']): Promise<string> {
    if (targetType === 'github-actions') {
      return this.convertToGitHubActions(analysis);
    }

    throw new Error(`Conversion to ${targetType} not yet implemented`);
  }

  private convertToGitHubActions(analysis: CIPipelineAnalysis): string {
    const workflow = {
      name: 'Playwright Tests',
      on: {
        push: {
          branches: ['main', 'develop']
        },
        pull_request: {
          branches: ['main']
        }
      },
      jobs: {
        test: {
          'runs-on': 'ubuntu-latest',
          steps: [
            {
              uses: 'actions/checkout@v4'
            },
            {
              name: 'Setup Node.js',
              uses: 'actions/setup-node@v4',
              with: {
                'node-version': '18',
                cache: 'npm'
              }
            },
            {
              name: 'Install dependencies',
              run: 'npm ci'
            },
            {
              name: 'Install Playwright Browsers',
              run: 'npx playwright install --with-deps'
            },
            {
              name: 'Run Playwright tests',
              run: 'npx playwright test'
            },
            {
              name: 'Upload test results',
              uses: 'actions/upload-artifact@v4',
              if: 'always()',
              with: {
                name: 'playwright-report',
                path: 'playwright-report/',
                'retention-days': 30
              }
            }
          ]
        }
      }
    };

    return yaml.dump(workflow, { quotingType: '"' });
  }
}
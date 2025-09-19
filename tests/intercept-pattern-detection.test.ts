import { describe, test, expect, beforeEach } from '@jest/globals';
import { InterceptAnalyzer } from '../src/services/intercept-analyzer';

describe('InterceptAnalyzer - cy.intercept() Pattern Detection', () => {
  let analyzer: InterceptAnalyzer;

  beforeEach(() => {
    analyzer = new InterceptAnalyzer();
  });

  describe('Simple cy.intercept() Detection', () => {
    test('should detect basic cy.intercept() with method and URL', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', '/api/users').as('getUsers');
        cy.intercept('POST', '/api/login', { statusCode: 200 });
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(2);
      expect(result.patterns[0].method).toBe('GET');
      expect(result.patterns[0].url).toBe('/api/users');
      expect(result.patterns[0].hasAlias).toBe(true);
      expect(result.patterns[0].alias).toBe('getUsers');
      expect(result.patterns[1].method).toBe('POST');
      expect(result.patterns[1].url).toBe('/api/login');
      expect(result.patterns[1].hasResponse).toBe(true);
    });

    test('should detect cy.intercept() with different HTTP methods', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', '/api/data').as('getData');
        cy.intercept('POST', '/api/create').as('postData');
        cy.intercept('PUT', '/api/update/*').as('updateData');
        cy.intercept('DELETE', '/api/delete/**').as('deleteData');
        cy.intercept('PATCH', '/api/patch').as('patchData');
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(5);
      expect(result.patterns.map(p => p.method)).toEqual(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
      expect(result.patterns.every(p => p.hasAlias)).toBe(true);
    });

    test('should detect URL patterns with wildcards and parameters', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', '/api/users/*').as('getUserById');
        cy.intercept('GET', '/api/projects/**/tasks').as('getProjectTasks');
        cy.intercept('POST', '/api/users/:id/preferences').as('updatePrefs');
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(3);
      expect(result.patterns[0].url).toBe('/api/users/*');
      expect(result.patterns[1].url).toBe('/api/projects/**/tasks');
      expect(result.patterns[2].url).toBe('/api/users/:id/preferences');
      expect(result.patterns[0].hasWildcard).toBe(true);
      expect(result.patterns[1].hasDoubleWildcard).toBe(true);
      expect(result.patterns[2].hasParameters).toBe(true);
    });
  });

  describe('cy.intercept() with Alias Creation', () => {
    test('should detect .as() alias patterns', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', '/api/users').as('getUsersRequest');
        cy.intercept('POST', '/api/login').as('loginRequest');
        cy.intercept('GET', '/api/profile/*').as('getProfile');
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(3);
      expect(result.patterns[0].alias).toBe('getUsersRequest');
      expect(result.patterns[1].alias).toBe('loginRequest');
      expect(result.patterns[2].alias).toBe('getProfile');
      expect(result.patterns.every(p => p.hasAlias)).toBe(true);
    });

    test('should handle intercepts without aliases', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', '/api/data', { fixture: 'data.json' });
        cy.intercept('POST', '/api/submit', { statusCode: 201, body: { success: true } });
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(2);
      expect(result.patterns[0].hasAlias).toBe(false);
      expect(result.patterns[1].hasAlias).toBe(false);
      expect(result.patterns[0].hasResponse).toBe(true);
      expect(result.patterns[1].hasResponse).toBe(true);
    });

    test('should track alias usage in cy.wait() calls', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', '/api/users').as('getUsers');
        cy.intercept('POST', '/api/login').as('loginUser');

        cy.wait('@getUsers');
        cy.wait('@loginUser').then(interception => {
          expect(interception.response.statusCode).to.eq(200);
        });
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(2);
      expect(result.aliasUsages).toHaveLength(2);
      expect(result.aliasUsages[0].alias).toBe('getUsers');
      expect(result.aliasUsages[1].alias).toBe('loginUser');
      expect(result.aliasUsages[1].hasInspection).toBe(true);
    });
  });

  describe('cy.intercept() with Response Mocking', () => {
    test('should detect fixture-based response mocking', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', '/api/users', { fixture: 'users.json' }).as('mockUsers');
        cy.intercept('GET', '/api/profile', { fixture: 'profile/user-profile.json' });
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(2);
      expect(result.patterns[0].responseType).toBe('fixture');
      expect(result.patterns[0].fixture).toBe('users.json');
      expect(result.patterns[1].responseType).toBe('fixture');
      expect(result.patterns[1].fixture).toBe('profile/user-profile.json');
    });

    test('should detect inline JSON response mocking', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', '/api/users', {
          statusCode: 200,
          body: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]
        }).as('mockUsers');

        cy.intercept('POST', '/api/login', {
          statusCode: 401,
          body: { error: 'Invalid credentials' }
        });
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(2);
      expect(result.patterns[0].responseType).toBe('inline');
      expect(result.patterns[0].statusCode).toBe(200);
      expect(result.patterns[0].responseBody).toContain('John');
      expect(result.patterns[1].statusCode).toBe(401);
    });

    test('should detect complex response objects with headers', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', '/api/data', {
          statusCode: 200,
          headers: {
            'content-type': 'application/json',
            'x-custom-header': 'test-value'
          },
          body: { data: 'test' }
        }).as('complexResponse');
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].hasHeaders).toBe(true);
      expect(result.patterns[0].headers).toContain('content-type');
      expect(result.patterns[0].headers).toContain('x-custom-header');
    });

    test('should detect response delays and throttling', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', '/api/slow', {
          statusCode: 200,
          body: { data: 'slow response' },
          delay: 2000
        }).as('slowResponse');

        cy.intercept('GET', '/api/throttled', {
          throttleKbps: 100,
          body: { data: 'throttled' }
        });
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(2);
      expect(result.patterns[0].hasDelay).toBe(true);
      expect(result.patterns[0].delay).toBe(2000);
      expect(result.patterns[1].hasThrottling).toBe(true);
      expect(result.patterns[1].throttleKbps).toBe(100);
    });
  });

  describe('Complex URL Pattern Detection', () => {
    test('should detect regex URL patterns from DLA examples', () => {
      // Arrange - Based on DLA project patterns
      const cypressCode = `
        cy.intercept('GET', /\\/api\\/users\\/\\d+/, { fixture: 'user.json' }).as('getUserById');
        cy.intercept('POST', /\\/api\\/projects\\/[a-z0-9-]+\\/tasks/, { statusCode: 201 });
        cy.intercept('GET', /\\/api\\/search\\?q=.+/, { fixture: 'search-results.json' });
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(3);
      expect(result.patterns[0].isRegex).toBe(true);
      expect(result.patterns[0].url).toBe('/\\/api\\/users\\/\\d+/');
      expect(result.patterns[1].isRegex).toBe(true);
      expect(result.patterns[2].isRegex).toBe(true);
    });

    test('should detect URL patterns with query parameters', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', '/api/search?q=*').as('searchRequest');
        cy.intercept('GET', '/api/users?page=*&limit=*').as('paginatedUsers');
        cy.intercept('POST', '/api/filter?**').as('filterRequest');
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(3);
      expect(result.patterns[0].hasQueryParams).toBe(true);
      expect(result.patterns[1].hasQueryParams).toBe(true);
      expect(result.patterns[2].hasQueryParams).toBe(true);
    });

    test('should detect URL patterns with environment variables', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', Cypress.env('API_BASE_URL') + '/users').as('envUsers');
        cy.intercept('POST', \`\${Cypress.env('API_URL')}/login\`).as('envLogin');
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(2);
      expect(result.patterns[0].hasDynamicUrl).toBe(true);
      expect(result.patterns[1].hasDynamicUrl).toBe(true);
      expect(result.patterns[0].urlPattern).toContain('Cypress.env');
      expect(result.patterns[1].urlPattern).toContain('Cypress.env');
    });
  });

  describe('Dynamic Response Generation', () => {
    test('should detect function-based response generation', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', '/api/users', (req) => {
          req.reply({
            statusCode: 200,
            body: { users: [], count: req.query.limit || 10 }
          });
        }).as('dynamicUsers');
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].responseType).toBe('function');
      expect(result.patterns[0].isDynamic).toBe(true);
      expect(result.patterns[0].usesRequestData).toBe(true);
    });

    test('should detect conditional response patterns', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('POST', '/api/login', (req) => {
          if (req.body.username === 'admin') {
            req.reply({ statusCode: 200, body: { role: 'admin' } });
          } else {
            req.reply({ statusCode: 401, body: { error: 'Unauthorized' } });
          }
        }).as('conditionalLogin');
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].hasConditionalLogic).toBe(true);
      expect(result.patterns[0].responseType).toBe('function');
      expect(result.patterns[0].usesRequestBody).toBe(true);
    });

    test('should detect response modification patterns', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', '/api/data', (req) => {
          req.continue((res) => {
            res.body = { ...res.body, modified: true, timestamp: Date.now() };
            res.send();
          });
        }).as('modifiedResponse');
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].modifiesResponse).toBe(true);
      expect(result.patterns[0].responseType).toBe('function');
      expect(result.patterns[0].usesContinue).toBe(true);
    });
  });

  describe('Multiple Intercept Patterns', () => {
    test('should handle multiple intercepts in same test', () => {
      // Arrange
      const cypressCode = `
        describe('API Tests', () => {
          beforeEach(() => {
            cy.intercept('GET', '/api/users', { fixture: 'users.json' }).as('getUsers');
            cy.intercept('POST', '/api/users', { statusCode: 201 }).as('createUser');
            cy.intercept('PUT', '/api/users/*', { statusCode: 200 }).as('updateUser');
          });

          it('should handle user operations', () => {
            cy.intercept('DELETE', '/api/users/*', { statusCode: 204 }).as('deleteUser');
            cy.wait('@getUsers');
            cy.wait('@createUser');
          });
        });
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(4);
      expect(result.aliasUsages).toHaveLength(2);
      expect(result.contextInfo.hasBeforeEach).toBe(true);
      expect(result.contextInfo.hasMultipleTests).toBe(true);
    });

    test('should track intercept scope and lifecycle', () => {
      // Arrange
      const cypressCode = `
        beforeEach(() => {
          cy.intercept('GET', '/api/config').as('getConfig');
        });

        it('test 1', () => {
          cy.intercept('POST', '/api/data').as('postData');
          cy.wait('@getConfig');
        });

        it('test 2', () => {
          cy.intercept('PUT', '/api/update').as('updateData');
          cy.wait('@getConfig');
        });
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(3);
      expect(result.scopeInfo.beforeEachIntercepts).toHaveLength(1);
      expect(result.scopeInfo.testLevelIntercepts).toHaveLength(2);
      expect(result.aliasUsages.filter(a => a.alias === 'getConfig')).toHaveLength(2);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed intercept patterns gracefully', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET'); // Missing URL
        cy.intercept('/api/data'); // Missing method
        cy.intercept('INVALID_METHOD', '/api/test'); // Invalid method
        cy.intercept('GET', '/api/valid').as('valid'); // Valid pattern
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(4);
      expect(result.patterns[0].isValid).toBe(false);
      expect(result.patterns[1].isValid).toBe(false);
      expect(result.patterns[2].isValid).toBe(false);
      expect(result.patterns[3].isValid).toBe(true);
      expect(result.errors).toHaveLength(3);
    });

    test('should detect nested intercept patterns in loops', () => {
      // Arrange
      const cypressCode = `
        const endpoints = ['/api/users', '/api/posts', '/api/comments'];
        endpoints.forEach(endpoint => {
          cy.intercept('GET', endpoint, { fixture: endpoint.replace('/', '') + '.json' })
            .as('mock' + endpoint.replace('/api/', ''));
        });
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].isInLoop).toBe(true);
      expect(result.patterns[0].isDynamic).toBe(true);
      expect(result.complexity).toBe('high');
    });

    test('should handle intercepts with comments and whitespace', () => {
      // Arrange
      const cypressCode = `
        // Mock user authentication
        cy.intercept(
          'POST',
          '/api/auth/login',
          {
            statusCode: 200,
            body: { token: 'fake-token' }
          }
        ).as('loginMock'); // Login alias

        /* Block for data fetching */
        cy.intercept('GET', '/api/data')
          .as('dataRequest');
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.patterns).toHaveLength(2);
      expect(result.patterns[0].method).toBe('POST');
      expect(result.patterns[0].url).toBe('/api/auth/login');
      expect(result.patterns[1].method).toBe('GET');
      expect(result.patterns[1].url).toBe('/api/data');
    });
  });

  describe('Performance and Complexity Analysis', () => {
    test('should analyze pattern complexity', () => {
      // Arrange - Simple pattern
      const simpleCode = `cy.intercept('GET', '/api/data').as('simple');`;

      // Complex pattern
      const complexCode = `
        cy.intercept('POST', /\\/api\\/complex\\/\\d+/, (req) => {
          if (req.body.type === 'premium') {
            req.continue((res) => {
              res.body = { ...res.body, enhanced: true };
              res.send();
            });
          } else {
            req.reply({ statusCode: 403 });
          }
        }).as('complex');
      `;

      // Act
      const simpleResult = analyzer.detectInterceptPatterns(simpleCode);
      const complexResult = analyzer.detectInterceptPatterns(complexCode);

      // Assert
      expect(simpleResult.complexity).toBe('low');
      expect(complexResult.complexity).toBe('high');
      expect(simpleResult.conversionDifficulty).toBe('easy');
      expect(complexResult.conversionDifficulty).toBe('hard');
    });

    test('should provide conversion recommendations', () => {
      // Arrange
      const cypressCode = `
        cy.intercept('GET', '/api/users', { fixture: 'users.json' }).as('users');
        cy.intercept('POST', '/api/login', (req) => {
          req.reply({ statusCode: req.body.valid ? 200 : 401 });
        }).as('login');
      `;

      // Act
      const result = analyzer.detectInterceptPatterns(cypressCode);

      // Assert
      expect(result.recommendations).toHaveLength(2);
      expect(result.recommendations[0].type).toBe('fixture_replacement');
      expect(result.recommendations[1].type).toBe('function_simplification');
    });
  });
});

import ExecutionSchedule from '../ExecutionSchedule.js';

// Mock date-fns-tz functions
jest.mock('date-fns-tz', () => ({
  format: jest.fn((date, formatStr, options) => {
    return `${date.toISOString()} ${options?.timeZone || 'UTC'}`;
  }),
  getTimezoneOffset: jest.fn((timeZone, date) => {
    // For testing purposes, always return a fixed offset
    if (timeZone === 'America/Chicago') {
      return -6 * 60 * 60 * 1000; // -6 hours in milliseconds for CST
    }
    return 0; // Default for UTC
  })
}));

describe('ExecutionSchedule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with default values', () => {
      const schedule = new ExecutionSchedule({});
      expect(schedule.timeZone).toBe('America/Chicago');
      expect(schedule.targetHour).toBe(5);
      expect(schedule.targetMinute).toBe(0);
      expect(schedule.lastExecutionDate).toBeNull();
    });

    test('should initialize with custom values', () => {
      const schedule = new ExecutionSchedule({
        timeZone: 'Europe/London',
        targetHour: 10,
        targetMinute: 30
      });
      expect(schedule.timeZone).toBe('Europe/London');
      expect(schedule.targetHour).toBe(10);
      expect(schedule.targetMinute).toBe(30);
      expect(schedule.lastExecutionDate).toBeNull();
    });
  });

  describe('convertToTimeZone', () => {
    test('should convert date to specified timezone', () => {
      const schedule = new ExecutionSchedule({});
      const testDate = new Date('2023-01-01T12:00:00Z');
      const result = schedule.convertToTimeZone(testDate);
      
      // With our mock, we should get a date that's 6 hours behind
      expect(result.getTime()).toBe(testDate.getTime() - 6 * 60 * 60 * 1000);
    });
  });

  describe('getTimeZoneString', () => {
    test('should format date in the specified timezone', () => {
      const schedule = new ExecutionSchedule({});
      const testDate = new Date('2023-01-01T12:00:00Z');
      const result = schedule.getTimeZoneString(testDate);
      
      expect(result).toContain('America/Chicago');
    });
  });

  describe('shouldTrigger', () => {
    test('should return false if before target time', () => {
      const schedule = new ExecutionSchedule({
        targetHour: 10,
        targetMinute: 0
      });
      
      // 9:00 AM in Chicago time (which would be 15:00 UTC)
      const testDate = new Date('2023-01-01T15:00:00Z');
      const result = schedule.shouldTrigger(testDate);
      
      expect(result).toBe(false);
    });

    test('should return true if after target time and not executed today', () => {
      const schedule = new ExecutionSchedule({
        targetHour: 5,
        targetMinute: 0
      });
      
      // 6:00 AM in Chicago time (which would be 12:00 UTC)
      const testDate = new Date('2023-01-01T12:00:00Z');
      const result = schedule.shouldTrigger(testDate);
      
      expect(result).toBe(true);
    });

    test('should return false if after target time but already executed today', () => {
      const schedule = new ExecutionSchedule({
        targetHour: 5,
        targetMinute: 0
      });
      
      // Mark as executed at 5:00 AM
      const executionDate = new Date('2023-01-01T11:00:00Z');
      schedule.markExecuted(executionDate);
      
      // 6:00 AM same day
      const testDate = new Date('2023-01-01T12:00:00Z');
      const result = schedule.shouldTrigger(testDate);
      
      expect(result).toBe(false);
    });

    test('should return true if after target time and executed yesterday', () => {
      const schedule = new ExecutionSchedule({
        targetHour: 5,
        targetMinute: 0
      });
      
      // Mark as executed at 5:00 AM yesterday
      const executionDate = new Date('2023-01-01T11:00:00Z');
      schedule.markExecuted(executionDate);
      
      // 6:00 AM today
      const testDate = new Date('2023-01-02T12:00:00Z');
      const result = schedule.shouldTrigger(testDate);
      
      expect(result).toBe(true);
    });

    test('should return true if exact target time and not executed today', () => {
      const schedule = new ExecutionSchedule({
        targetHour: 5,
        targetMinute: 0
      });
      
      // 5:00 AM in Chicago time (11:00 UTC)
      const testDate = new Date('2023-01-01T11:00:00Z');
      const result = schedule.shouldTrigger(testDate);
      
      expect(result).toBe(true);
    });
  });

  describe('markExecuted', () => {
    test('should store execution date as start of day in timezone', () => {
      const schedule = new ExecutionSchedule({});
      const testDate = new Date('2023-01-01T12:00:00Z');
      schedule.markExecuted(testDate);
      
      // The lastExecutionDate should be the start of day in Chicago time
      expect(schedule.lastExecutionDate).not.toBeNull();
      expect(schedule.lastExecutionDate.getHours()).toBe(0);
      expect(schedule.lastExecutionDate.getMinutes()).toBe(0);
      expect(schedule.lastExecutionDate.getSeconds()).toBe(0);
      expect(schedule.lastExecutionDate.getMilliseconds()).toBe(0);
    });
  });
});

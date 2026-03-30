/**
 * Logger estruturado para o backend
 * Níveis: DEBUG, INFO, WARN, ERROR
 */
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] || LOG_LEVELS.INFO;

function log(level, module, message, data = null) {
  if (LOG_LEVELS[level] < CURRENT_LEVEL) return;
  
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}] [${module}]`;
  
  if (data !== null) {
    console.log(`${prefix} ${message}`, JSON.stringify(data));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

module.exports = {
  debug: (module, msg, data) => log('DEBUG', module, msg, data),
  info: (module, msg, data) => log('INFO', module, msg, data),
  warn: (module, msg, data) => log('WARN', module, msg, data),
  error: (module, msg, data) => log('ERROR', module, msg, data),
};

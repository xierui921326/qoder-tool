/**
 * 加密工具函数
 */
import crypto from 'crypto';

/**
 * 生成随机盐值
 * @param {number} length - 盐值长度，默认32字节
 * @returns {Buffer} 盐值
 */
export function generateSalt(length = 32) {
  return crypto.randomBytes(length);
}

/**
 * 生成强密码
 * @param {number} length - 密码长度，默认16位
 * @param {Object} options - 选项
 * @param {boolean} options.includeSymbols - 是否包含符号，默认true
 * @param {boolean} options.includeNumbers - 是否包含数字，默认true
 * @param {boolean} options.includeUppercase - 是否包含大写字母，默认true
 * @param {boolean} options.includeLowercase - 是否包含小写字母，默认true
 * @returns {string} 生成的密码
 */
export function generateStrongPassword(length = 16, options = {}) {
  const {
    includeSymbols = true,
    includeNumbers = true,
    includeUppercase = true,
    includeLowercase = true
  } = options;

  let charset = '';
  if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
  if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (includeNumbers) charset += '0123456789';
  if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (charset === '') {
    throw new Error('至少需要选择一种字符类型');
  }

  let password = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, charset.length);
    password += charset[randomIndex];
  }

  return password;
}

/**
 * 使用PBKDF2派生密钥
 * @param {string} password - 密码
 * @param {Buffer} salt - 盐值
 * @param {number} iterations - 迭代次数，默认100000
 * @param {number} keyLength - 密钥长度，默认32字节
 * @returns {Promise<Buffer>} 派生的密钥
 */
export function deriveKey(password, salt, iterations = 100000, keyLength = 32) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, keyLength, 'sha256', (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * AES-256-GCM加密
 * @param {string} plaintext - 明文
 * @param {Buffer} key - 加密密钥
 * @returns {Object} 包含加密数据、IV和认证标签的对象
 */
export function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(16); // 生成随机IV
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('qoder-account-manager', 'utf8')); // 附加认证数据

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * AES-256-GCM解密
 * @param {Object} encryptedData - 加密数据对象
 * @param {string} encryptedData.encrypted - 加密的数据
 * @param {string} encryptedData.iv - 初始化向量
 * @param {string} encryptedData.authTag - 认证标签
 * @param {Buffer} key - 解密密钥
 * @returns {string} 解密后的明文
 */
export function decrypt(encryptedData, key) {
  const { encrypted, iv, authTag } = encryptedData;
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAAD(Buffer.from('qoder-account-manager', 'utf8'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * 生成哈希值
 * @param {string} data - 要哈希的数据
 * @param {string} algorithm - 哈希算法，默认sha256
 * @returns {string} 哈希值（十六进制）
 */
export function hash(data, algorithm = 'sha256') {
  return crypto.createHash(algorithm).update(data).digest('hex');
}

/**
 * 验证密码强度
 * @param {string} password - 密码
 * @returns {Object} 包含强度评分和建议的对象
 */
export function validatePasswordStrength(password) {
  const result = {
    score: 0,
    feedback: [],
    isStrong: false
  };

  // 长度检查
  if (password.length >= 12) {
    result.score += 2;
  } else if (password.length >= 8) {
    result.score += 1;
  } else {
    result.feedback.push('密码长度至少应为8位');
  }

  // 字符类型检查
  if (/[a-z]/.test(password)) result.score += 1;
  else result.feedback.push('应包含小写字母');

  if (/[A-Z]/.test(password)) result.score += 1;
  else result.feedback.push('应包含大写字母');

  if (/[0-9]/.test(password)) result.score += 1;
  else result.feedback.push('应包含数字');

  if (/[^a-zA-Z0-9]/.test(password)) result.score += 1;
  else result.feedback.push('应包含特殊字符');

  // 复杂性检查
  if (!/(.)\1{2,}/.test(password)) result.score += 1;
  else result.feedback.push('避免连续重复字符');

  result.isStrong = result.score >= 6;
  
  return result;
}
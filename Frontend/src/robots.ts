// ==========================================================================
// SMART ADAM - ROBOTS METADATA CONFIGURATION (robots.ts)
// Domain: https://smartadam.jinwoostream.lol
// ==========================================================================

export interface RobotRule {
  userAgent: string;
  allow?: string[];
  disallow?: string[];
}

export interface RobotsConfig {
  host: string;
  sitemap: string;
  rules: RobotRule[];
}

export const SITE_DOMAIN = 'smartadam.jinwoostream.lol';
export const SITE_ORIGIN = `https://${SITE_DOMAIN}`;

export const robotsConfig: RobotsConfig = {
  host: SITE_ORIGIN,
  sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  rules: [
    {
      userAgent: '*',
      allow: ['/', '/dashboard', '/logs', '/login', '/register'],
      disallow: ['/editor', '/verify-otp', '/forgot-password'],
    },
    {
      userAgent: 'Googlebot',
      allow: ['/', '/dashboard', '/logs'],
      disallow: ['/editor', '/verify-otp'],
    },
  ],
};

/**
 * Generate standard robots.txt content string
 */
export function generateRobotsTxt(): string {
  let output = `# SMART ADAM - Automated Dustbin And Management Robots Policy\n`;
  output += `# Host: ${robotsConfig.host}\n\n`;

  for (const rule of robotsConfig.rules) {
    output += `User-agent: ${rule.userAgent}\n`;
    if (rule.allow) {
      for (const path of rule.allow) {
        output += `Allow: ${path}\n`;
      }
    }
    if (rule.disallow) {
      for (const path of rule.disallow) {
        output += `Disallow: ${path}\n`;
      }
    }
    output += `\n`;
  }

  output += `Sitemap: ${robotsConfig.sitemap}\n`;
  return output;
}

export default robotsConfig;

# Security Policy

## Supported Versions

We take security seriously. The following versions of Geeto are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Geeto, please help us by reporting it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities by creating a private security advisory on GitHub.

You can create a private security advisory by:

1. Going to the **Security** tab in this repository
2. Clicking **"Report a vulnerability"**
3. Filling out the form with details about the vulnerability

### What to Include

When reporting a vulnerability, please include:

- A clear description of the vulnerability
- Steps to reproduce the issue
- Potential impact and severity
- Any suggested fixes or mitigations (if known)
- Your contact information for follow-up

### Our Response Process

1. **Acknowledgment**: We'll acknowledge receipt of your report within 48 hours
2. **Investigation**: We'll investigate the issue and determine its validity and severity
3. **Updates**: We'll provide regular updates on our progress (at least weekly)
4. **Fix**: We'll work on a fix for validated vulnerabilities
5. **Disclosure**: We'll coordinate disclosure timing with you

### Disclosure Policy

- We'll credit you (with your permission) in our security advisory
- We'll follow responsible disclosure practices
- We'll aim to release fixes as quickly as possible
- We'll notify users about security updates through our release notes

## Security Best Practices for Users

While we work to keep Geeto secure, here are some best practices for users:

### API Keys and Tokens

- Never commit API keys or tokens to version control
- Use environment variables or secure credential storage
- Rotate keys regularly
- Use the principle of least privilege

### Network Security

- Use HTTPS when possible
- Be cautious with third-party integrations
- Keep your system and dependencies updated

### General Security

- Review code changes before merging
- Use branch protection rules
- Enable security scanning in your CI/CD pipeline
- Monitor for unusual activity

## Security Updates

Security updates will be released as patch versions with high priority. We'll announce security releases through:

- GitHub Security Advisories
- Release notes with security notices
- Our changelog
- Social media announcements (if applicable)

Thank you for helping keep Geeto and its users secure!

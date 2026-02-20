# Security Policy

## Supported Versions

| Version        | Supported          |
| -------------- | ------------------ |
| 0.3.x (latest) | :white_check_mark: |
| < 0.3.0        | :x:                |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, use GitHub's private security advisory feature:

1. Go to the **Security** tab in this repository
2. Click **"Report a vulnerability"**
3. Fill out the form with details

### What to Include

- A clear description of the vulnerability
- Steps to reproduce the issue
- Potential impact and severity
- Suggested fixes or mitigations (if known)

### Response Timeline

| Step              | Timeline                  |
| ----------------- | ------------------------- |
| Acknowledgment    | Within 48 hours           |
| Investigation     | Within 1 week             |
| Fix release       | As soon as possible       |
| Public disclosure | Coordinated with reporter |

We'll credit you (with your permission) in our security advisory.

## Security Best Practices

### API Keys & Tokens

- Never commit API keys or tokens to version control
- Geeto stores credentials locally in `.geeto/` — keep this directory private
- Rotate keys regularly
- Use the principle of least privilege

### Network Security

- All API calls use HTTPS
- Be cautious with third-party integrations
- Keep your system and dependencies updated

### General

- Review code changes before merging
- Enable branch protection rules
- Monitor for unusual activity

## Security Updates

Security fixes are released as patch versions with high priority. Announcements are made through:

- [GitHub Security Advisories](https://github.com/rust142/geeto/security/advisories)
- [Release notes](https://github.com/rust142/geeto/releases)
- [CHANGELOG.md](CHANGELOG.md)

## Contact

For security-related inquiries: [amdev142@gmail.com](mailto:amdev142@gmail.com)

Thank you for helping keep Geeto and its users secure!

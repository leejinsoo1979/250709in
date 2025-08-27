# Template MVP Migration & Rollback Guide

## Table of Contents
1. [Migration Overview](#migration-overview)
2. [Pre-Migration Checklist](#pre-migration-checklist)
3. [Migration Steps](#migration-steps)
4. [Rollback Procedures](#rollback-procedures)
5. [Emergency Recovery](#emergency-recovery)
6. [Troubleshooting](#troubleshooting)

## Migration Overview

The Template MVP introduces significant changes to the PDF generation system. This guide ensures smooth migration from existing systems and provides comprehensive rollback procedures if needed.

### Impact Assessment
- **Low Risk**: New feature addition, no breaking changes to existing functionality
- **Data Migration**: Optional - existing projects continue to work without templates
- **Downtime**: Zero - gradual rollout possible
- **Rollback Time**: < 5 minutes for configuration changes

## Pre-Migration Checklist

### System Requirements
- [ ] Node.js >= 18.0.0
- [ ] Firebase project configured
- [ ] Minimum 2GB available storage
- [ ] Modern browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)

### Backup Checklist
```bash
# 1. Backup current configuration
cp -r src/firebase src/firebase.backup
cp package.json package.json.backup
cp package-lock.json package-lock.json.backup

# 2. Export Firebase data (requires Firebase CLI)
firebase firestore:export ./backups/firestore-$(date +%Y%m%d)

# 3. Create git backup branch
git checkout -b backup/pre-template-mvp
git push origin backup/pre-template-mvp
```

### Dependency Verification
```bash
# Check required packages
npm list jspdf html2canvas svg2pdf.js fabric

# Expected versions:
# ├── jspdf@2.5.1
# ├── html2canvas@1.4.1
# ├── svg2pdf.js@2.2.1
# └── fabric@5.3.0
```

## Migration Steps

### Step 1: Install Dependencies
```bash
# Install new dependencies
npm install jspdf@^2.5.1 html2canvas@^1.4.1 svg2pdf.js@^2.2.1 fabric@^5.3.0

# Verify installation
npm run build
```

### Step 2: Database Schema Updates
```javascript
// Firebase schema additions (automatic on first use)
// templates collection structure:
{
  teamId: string,
  templateId: string,
  name: string,
  description: string,
  thumbnail: string, // base64 or URL
  paperSize: string,
  orientation: string,
  pages: Array<ViewPosition[]>,
  version: number,
  createdBy: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Step 3: Deploy Template Component
```bash
# 1. Ensure component is in place
ls -la src/editor/shared/components/PDFTemplatePreview/

# 2. Verify imports in main editor
grep -r "PDFTemplatePreview" src/editor/

# 3. Build and test locally
npm run dev
# Test template feature manually

# 4. Run tests
npm run test

# 5. Deploy to production
npm run build
# Deploy built files to hosting service
```

### Step 4: Configure Permissions
```javascript
// Firebase Security Rules Update
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Add template permissions
    match /teams/{teamId}/templates/{templateId} {
      allow read: if request.auth != null && 
                     request.auth.uid in resource.data.teamMembers;
      allow write: if request.auth != null && 
                      (request.auth.uid == resource.data.createdBy ||
                       request.auth.uid in resource.data.admins);
      allow create: if request.auth != null;
    }
  }
}
```

### Step 5: Enable Feature Flags (Optional)
```typescript
// src/config/features.ts
export const FEATURES = {
  TEMPLATE_MVP: process.env.REACT_APP_TEMPLATE_MVP === 'true' || true,
  // Gradual rollout possible with percentage
  TEMPLATE_MVP_ROLLOUT: 100, // 0-100 percentage
};

// Usage in component
import { FEATURES } from '@/config/features';

{FEATURES.TEMPLATE_MVP && (
  <PDFTemplatePreview />
)}
```

### Step 6: Verify Migration
```bash
# Run verification script
node scripts/verify-template-migration.js

# Manual verification checklist:
# - [ ] Template editor opens correctly
# - [ ] Views can be dragged and dropped
# - [ ] PDF generation works
# - [ ] Templates save to Firebase
# - [ ] Templates load from Firebase
# - [ ] Thumbnails generate correctly
```

## Rollback Procedures

### Quick Rollback (< 5 minutes)
```bash
# 1. Disable feature flag
export REACT_APP_TEMPLATE_MVP=false

# 2. Rebuild without template feature
npm run build

# 3. Deploy
# Redeploy to hosting service
```

### Component Rollback
```bash
# 1. Restore backup files
cp src/firebase.backup/* src/firebase/
cp package.json.backup package.json
cp package-lock.json.backup package-lock.json

# 2. Reinstall dependencies
rm -rf node_modules
npm install

# 3. Rebuild and deploy
npm run build
# Deploy to hosting
```

### Database Rollback
```bash
# 1. Remove template collections (if needed)
# Use Firebase Console or CLI
firebase firestore:delete teams/{teamId}/templates --recursive

# 2. Restore from backup
firebase firestore:import ./backups/firestore-[date]

# 3. Verify data integrity
node scripts/verify-database.js
```

### Git Rollback
```bash
# Complete rollback to pre-migration state
git checkout backup/pre-template-mvp
git checkout -b main-rollback
git push origin main-rollback --force

# Alternative: Revert specific commits
git revert [commit-hash] # Template MVP commits
git push origin main
```

## Emergency Recovery

### Critical Failure Scenario
If the application becomes completely unusable:

```bash
# 1. Immediate rollback to last known good state
git checkout [last-good-commit]
npm install
npm run build
# Emergency deploy

# 2. Disable all new features
export REACT_APP_TEMPLATE_MVP=false
export REACT_APP_SAFE_MODE=true

# 3. Notify users
# Update status page or send notifications

# 4. Investigate and fix
# Check logs, errors, and user reports
```

### Data Recovery
```javascript
// Emergency data recovery script
const admin = require('firebase-admin');
admin.initializeApp();

async function recoverTemplates() {
  const db = admin.firestore();
  
  // Get all teams
  const teams = await db.collection('teams').get();
  
  for (const team of teams.docs) {
    const teamId = team.id;
    
    // Check template integrity
    const templates = await db.collection(`teams/${teamId}/templates`).get();
    
    for (const template of templates.docs) {
      const data = template.data();
      
      // Validate and fix if needed
      if (!data.version) {
        await template.ref.update({ version: 1 });
      }
      if (!data.pages || !Array.isArray(data.pages)) {
        await template.ref.update({ pages: [[]] });
      }
    }
  }
  
  console.log('Recovery complete');
}

recoverTemplates();
```

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: Template Editor Won't Open
```bash
# Check console for errors
# Common causes:
# - Missing dependencies
# - WebGL not supported
# - Memory issues

# Solutions:
npm install --force
# Clear browser cache
# Enable hardware acceleration
# Restart browser
```

#### Issue 2: PDF Generation Fails
```javascript
// Debug PDF generation
console.log('Checking dependencies...');
console.log('jsPDF:', typeof jsPDF);
console.log('html2canvas:', typeof html2canvas);

// Common fixes:
// - Reduce number of views
// - Lower image quality
// - Use raster mode instead of vector
// - Clear browser storage
```

#### Issue 3: Templates Not Saving
```bash
# Check Firebase permissions
firebase auth:export users.json
# Verify user has correct role

# Check Firestore rules
firebase deploy --only firestore:rules

# Check network
# Verify Firebase connection in Network tab
```

#### Issue 4: Performance Issues
```javascript
// Performance optimization
const optimizeTemplate = {
  // Reduce view count
  maxViewsPerPage: 10, // instead of 20
  
  // Lower quality settings
  imageQuality: 0.8, // instead of 0.92
  
  // Use raster mode
  defaultMode: 'raster', // instead of 'vector'
  
  // Limit pages
  maxPages: 5, // instead of 10
};
```

### Monitoring and Alerts

#### Set up monitoring
```javascript
// Add performance monitoring
import { getPerformance } from 'firebase/performance';

const perf = getPerformance();
const trace = perf.trace('template_generation');

trace.start();
// Template generation code
trace.stop();

// Add custom metrics
trace.putMetric('view_count', viewPositions.length);
trace.putMetric('generation_time', Date.now() - startTime);
```

#### Error tracking
```javascript
// Add error boundary
class TemplateErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    // Log to monitoring service
    console.error('Template Error:', error);
    
    // Send to Firebase Crashlytics
    if (window.FirebaseCrashlytics) {
      window.FirebaseCrashlytics.log('Template error');
      window.FirebaseCrashlytics.recordError(error);
    }
    
    // Fallback UI
    this.setState({ hasError: true });
  }
}
```

## Post-Migration Validation

### Automated Tests
```bash
# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Performance benchmarks
npm run benchmark:template
```

### Manual Validation Checklist
- [ ] Create new template
- [ ] Load existing template
- [ ] Add all view types
- [ ] Test all paper sizes
- [ ] Generate PDF with 10 pages
- [ ] Upload image and DXF files
- [ ] Test on all supported browsers
- [ ] Verify mobile responsiveness
- [ ] Check accessibility compliance
- [ ] Test with slow network

### Success Metrics
- PDF generation time < 5 seconds
- Template save time < 2 seconds
- Memory usage < 200MB
- No console errors
- User satisfaction > 90%

## Support Contacts

### Escalation Path
1. **Level 1**: Check documentation and FAQ
2. **Level 2**: Development team slack channel
3. **Level 3**: Senior engineers
4. **Emergency**: On-call engineer

### Resources
- Documentation: `/docs/features/template-mvp-guide.md`
- API Reference: `/docs/api/template-api.md`
- Architecture: `/docs/architecture/template-system.md`
- Support Email: support@example.com

## Appendix

### Version Compatibility Matrix
| Component | Old Version | New Version | Compatible |
|-----------|------------|-------------|------------|
| React | 18.2.0 | 18.2.0 | ✅ |
| Firebase | 10.x | 10.x | ✅ |
| Three.js | 0.160.x | 0.160.x | ✅ |
| Node.js | 16.x | 18.x | ⚠️ Upgrade recommended |

### Feature Toggle Configuration
```json
{
  "features": {
    "template_mvp": {
      "enabled": true,
      "rollout_percentage": 100,
      "whitelist_users": [],
      "blacklist_users": [],
      "start_date": "2025-01-27",
      "end_date": null
    }
  }
}
```

### Rollback Decision Tree
```
Application Error?
├── Yes → Critical?
│   ├── Yes → Emergency Rollback
│   └── No → Fix Forward
└── No → Performance Issue?
    ├── Yes → Optimize First
    └── No → Monitor

Data Corruption?
├── Yes → Database Rollback
└── No → Continue

User Impact?
├── > 50% → Immediate Rollback
├── 10-50% → Feature Flag Disable
└── < 10% → Fix Forward
```

---

*Last Updated: 2025-01-27*
*Version: 1.0.0*
*Author: Development Team*
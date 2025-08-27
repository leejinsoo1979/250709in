#!/usr/bin/env ts-node
/**
 * Migration script to copy designs from root and team-level to nested project paths
 * 
 * This script COPIES (not moves) designs to the new nested structure:
 * - FROM: designFiles/{designId}
 * - FROM: teams/{teamId}/designs/{designId}  
 * - TO:   teams/{teamId}/projects/{projectId}/designs/{designId}
 * 
 * It also copies all versions to maintain history.
 * 
 * Usage:
 * TEAM_ID=personal_user123 ts-node --transpile-only scripts/migrate-designs-to-projects.ts
 * 
 * Or with npm script:
 * npm run migrate:designs:nested
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialize Firebase Admin
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY 
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  : require('../service-account-key.json');

initializeApp({
  credential: cert(serviceAccount),
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || serviceAccount.project_id
});

const db = getFirestore();

interface DesignData {
  id: string;
  name: string;
  projectId: string;
  teamId?: string;
  userId: string;
  [key: string]: any;
}

async function migrateDesigns() {
  const teamId = process.env.TEAM_ID;
  
  if (!teamId) {
    console.error('❌ TEAM_ID environment variable is required');
    process.exit(1);
  }

  console.log(`🚀 Starting design migration for team: ${teamId}`);
  
  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  try {
    // Step 1: Migrate from root designFiles collection
    console.log('\n📦 Step 1: Migrating from root designFiles collection...');
    const legacyDesigns = await db.collection('designFiles').get();
    
    for (const doc of legacyDesigns.docs) {
      const data = doc.data() as DesignData;
      
      // Skip if no projectId
      if (!data.projectId) {
        console.log(`⏭️  Skipping design ${doc.id} - no projectId`);
        skippedCount++;
        continue;
      }

      try {
        // Check if already exists in nested path
        const nestedPath = `teams/${teamId}/projects/${data.projectId}/designs/${doc.id}`;
        const nestedDoc = await db.doc(nestedPath).get();
        
        if (nestedDoc.exists) {
          console.log(`✓ Design ${doc.id} already exists in nested path`);
          skippedCount++;
          continue;
        }

        // Copy to nested path
        await db.doc(nestedPath).set({
          ...data,
          teamId,
          migrated_from: 'designFiles',
          migrated_at: FieldValue.serverTimestamp()
        });

        console.log(`✅ Migrated design ${doc.id} to nested path`);
        migratedCount++;
      } catch (error) {
        console.error(`❌ Error migrating design ${doc.id}:`, error);
        errorCount++;
      }
    }

    // Step 2: Migrate from team-level designs
    console.log(`\n📦 Step 2: Migrating from teams/${teamId}/designs...`);
    const teamDesigns = await db.collection(`teams/${teamId}/designs`).get();
    
    for (const doc of teamDesigns.docs) {
      const data = doc.data() as DesignData;
      
      // Skip if no projectId
      if (!data.projectId) {
        console.log(`⏭️  Skipping design ${doc.id} - no projectId`);
        skippedCount++;
        continue;
      }

      try {
        // Check if already exists in nested path
        const nestedPath = `teams/${teamId}/projects/${data.projectId}/designs/${doc.id}`;
        const nestedDoc = await db.doc(nestedPath).get();
        
        if (nestedDoc.exists) {
          console.log(`✓ Design ${doc.id} already exists in nested path`);
          skippedCount++;
          continue;
        }

        // Copy to nested path
        await db.doc(nestedPath).set({
          ...data,
          teamId,
          migrated_from: 'team_designs',
          migrated_at: FieldValue.serverTimestamp()
        });

        console.log(`✅ Migrated design ${doc.id} to nested path`);

        // Also migrate versions if they exist
        const versionsPath = `teams/${teamId}/designs/${doc.id}/versions`;
        const versions = await db.collection(versionsPath).get();
        
        if (!versions.empty) {
          console.log(`  📚 Migrating ${versions.size} versions...`);
          
          for (const versionDoc of versions.docs) {
            const versionData = versionDoc.data();
            const nestedVersionPath = `teams/${teamId}/projects/${data.projectId}/designs/${doc.id}/versions/${versionDoc.id}`;
            
            await db.doc(nestedVersionPath).set({
              ...versionData,
              migrated_from: 'team_versions',
              migrated_at: FieldValue.serverTimestamp()
            });
          }
          
          console.log(`  ✅ Migrated ${versions.size} versions`);
        }

        migratedCount++;
      } catch (error) {
        console.error(`❌ Error migrating design ${doc.id}:`, error);
        errorCount++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary:');
    console.log(`✅ Successfully migrated: ${migratedCount} designs`);
    console.log(`⏭️  Skipped (already exist or no projectId): ${skippedCount} designs`);
    console.log(`❌ Errors: ${errorCount} designs`);
    console.log('='.repeat(50));

    // Verify migration
    if (migratedCount > 0) {
      console.log('\n🔍 Verifying migration...');
      
      // Count designs in each location
      const projects = await db.collection(`teams/${teamId}/projects`).get();
      
      for (const projectDoc of projects.docs) {
        const nestedDesigns = await db.collection(`teams/${teamId}/projects/${projectDoc.id}/designs`).get();
        console.log(`  Project ${projectDoc.id}: ${nestedDesigns.size} designs`);
      }
    }

    console.log('\n✨ Migration complete!');
    console.log('📝 Note: Original designs were NOT deleted. Enable FLAGS.nestedDesigns to use the new paths.');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateDesigns()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
/**
 * One-time migration: add pos_session_id, verification_type, breakdown columns
 * to pos_verifications in all existing tenant databases.
 *
 * Run with:  npx tsx src/scripts/migration.ts
 */

import '../config/env.js';
import { db } from '../config/database.js';

async function migrateTenantsDb() {
  const masterDb = db.getMasterDb();
  const companies = await masterDb('companies').where({ is_active: true });

  console.log(`Found ${companies.length} active company/tenant DB(s).`);

  for (const company of companies) {
    console.log(`\nMigrating: ${company.db_name}`);
    try {
      const tenantDb = await db.getTenantDb(company.db_name);

      // Add verification_type if missing
      const hasVerificationType = await tenantDb.schema.hasColumn('pos_verifications', 'verification_type');
      if (!hasVerificationType) {
        await tenantDb.schema.alterTable('pos_verifications', (table) => {
          table.string('verification_type', 50).nullable();
        });
        console.log('  + added verification_type');
      } else {
        console.log('  - verification_type already exists');
      }

      // Add breakdown if missing
      const hasBreakdown = await tenantDb.schema.hasColumn('pos_verifications', 'breakdown');
      if (!hasBreakdown) {
        await tenantDb.schema.alterTable('pos_verifications', (table) => {
          table.jsonb('breakdown').nullable();
        });
        console.log('  + added breakdown');
      } else {
        console.log('  - breakdown already exists');
      }

      // Add pos_session_id if missing (FK to pos_sessions)
      const hasPosSessionId = await tenantDb.schema.hasColumn('pos_verifications', 'pos_session_id');
      if (!hasPosSessionId) {
        await tenantDb.schema.alterTable('pos_verifications', (table) => {
          table.uuid('pos_session_id').nullable().references('id').inTable('pos_sessions');
        });
        console.log('  + added pos_session_id');
      } else {
        console.log('  - pos_session_id already exists');
      }

      // Add audit_rating if missing
      const hasAuditRating = await tenantDb.schema.hasColumn('pos_verifications', 'audit_rating');
      if (!hasAuditRating) {
        await tenantDb.schema.alterTable('pos_verifications', (table) => {
          table.integer('audit_rating').nullable();
        });
        console.log('  + added audit_rating');
      } else {
        console.log('  - audit_rating already exists');
      }

      // Add audit_details if missing
      const hasAuditDetails = await tenantDb.schema.hasColumn('pos_verifications', 'audit_details');
      if (!hasAuditDetails) {
        await tenantDb.schema.alterTable('pos_verifications', (table) => {
          table.text('audit_details').nullable();
        });
        console.log('  + added audit_details');
      } else {
        console.log('  - audit_details already exists');
      }

      // Add cashier_user_id if missing (for discount_order verifications)
      const hasCashierUserId = await tenantDb.schema.hasColumn('pos_verifications', 'cashier_user_id');
      if (!hasCashierUserId) {
        await tenantDb.schema.alterTable('pos_verifications', (table) => {
          table.uuid('cashier_user_id').nullable();
        });
        console.log('  + added cashier_user_id');
      } else {
        console.log('  - cashier_user_id already exists');
      }

      // Add customer_user_id if missing (for token_pay_order verifications)
      const hasCustomerUserId = await tenantDb.schema.hasColumn('pos_verifications', 'customer_user_id');
      if (!hasCustomerUserId) {
        await tenantDb.schema.alterTable('pos_verifications', (table) => {
          table.uuid('customer_user_id').nullable();
        });
        console.log('  + added customer_user_id');
      } else {
        console.log('  - customer_user_id already exists');
      }

      // Add customer_rejection_reason if missing (for token_pay_order customer rejection)
      const hasCustomerRejectionReason = await tenantDb.schema.hasColumn('pos_verifications', 'customer_rejection_reason');
      if (!hasCustomerRejectionReason) {
        await tenantDb.schema.alterTable('pos_verifications', (table) => {
          table.text('customer_rejection_reason').nullable();
        });
        console.log('  + added customer_rejection_reason');
      } else {
        console.log('  - customer_rejection_reason already exists');
      }

      // Add audited_by if missing
      const hasAuditedBy = await tenantDb.schema.hasColumn('pos_verifications', 'audited_by');
      if (!hasAuditedBy) {
        await tenantDb.schema.alterTable('pos_verifications', (table) => {
          table.uuid('audited_by').nullable();
        });
        console.log('  + added audited_by');
      } else {
        console.log('  - audited_by already exists');
      }

      // Add audited_at if missing
      const hasAuditedAt = await tenantDb.schema.hasColumn('pos_verifications', 'audited_at');
      if (!hasAuditedAt) {
        await tenantDb.schema.alterTable('pos_verifications', (table) => {
          table.timestamp('audited_at').nullable();
        });
        console.log('  + added audited_at');
      } else {
        console.log('  - audited_at already exists');
      }

      // Create employee_shifts table if missing
      const hasShiftsTable = await tenantDb.schema.hasTable('employee_shifts');
      if (!hasShiftsTable) {
        await tenantDb.schema.createTable('employee_shifts', (table) => {
          table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
          table.integer('odoo_shift_id').notNullable();
          table.uuid('branch_id').notNullable().references('id').inTable('branches');
          table.uuid('user_id').nullable().references('id').inTable('users');
          table.string('employee_name', 255).notNullable();
          table.string('employee_avatar_url', 500);
          table.string('duty_type', 100).notNullable();
          table.integer('duty_color').notNullable();
          table.timestamp('shift_start').notNullable();
          table.timestamp('shift_end').notNullable();
          table.decimal('allocated_hours', 5, 2).notNullable();
          table.decimal('total_worked_hours', 5, 2).nullable();
          table.integer('pending_approvals').notNullable().defaultTo(0);
          table.jsonb('odoo_payload').notNullable();
          table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
          table.timestamp('updated_at').notNullable().defaultTo(tenantDb.fn.now());
          table.unique(['odoo_shift_id', 'branch_id']);
        });
        console.log('  + created employee_shifts table');
      } else {
        console.log('  - employee_shifts table already exists');
        // Ensure pending_approvals column exists on pre-existing employee_shifts tables
        const hasPendingApprovals = await tenantDb.schema.hasColumn('employee_shifts', 'pending_approvals');
        if (!hasPendingApprovals) {
          await tenantDb.schema.alterTable('employee_shifts', (table) => {
            table.integer('pending_approvals').notNullable().defaultTo(0);
          });
          console.log('  + added pending_approvals column to employee_shifts');
        } else {
          console.log('  - pending_approvals column already exists');
        }
      }

      // Create shift_logs table if missing
      const hasShiftLogsTable = await tenantDb.schema.hasTable('shift_logs');
      if (!hasShiftLogsTable) {
        await tenantDb.schema.createTable('shift_logs', (table) => {
          table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
          table.uuid('shift_id').nullable().references('id').inTable('employee_shifts');
          table.uuid('branch_id').notNullable().references('id').inTable('branches');
          table.string('log_type', 30).notNullable();
          table.jsonb('changes').nullable();
          table.integer('odoo_attendance_id').nullable();
          table.timestamp('event_time').notNullable();
          table.decimal('worked_hours', 8, 4).nullable();
          table.integer('cumulative_minutes').nullable();
          table.jsonb('odoo_payload').notNullable();
          table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
        });
        console.log('  + created shift_logs table');
      } else {
        console.log('  - shift_logs table already exists');
      }

      // Create shift_authorizations table if missing
      const hasShiftAuthTable = await tenantDb.schema.hasTable('shift_authorizations');
      if (!hasShiftAuthTable) {
        await tenantDb.schema.createTable('shift_authorizations', (table) => {
          table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
          table.uuid('shift_id').notNullable().references('id').inTable('employee_shifts');
          table.uuid('shift_log_id').notNullable().references('id').inTable('shift_logs');
          table.uuid('branch_id').notNullable().references('id').inTable('branches');
          table.uuid('user_id').nullable().references('id').inTable('users');
          table.string('auth_type', 50).notNullable();
          table.integer('diff_minutes').notNullable();
          table.boolean('needs_employee_reason').notNullable().defaultTo(false);
          table.string('status', 20).notNullable().defaultTo('pending');
          table.text('employee_reason').nullable();
          table.text('rejection_reason').nullable();
          table.uuid('resolved_by').nullable().references('id').inTable('users');
          table.timestamp('resolved_at').nullable();
          table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
        });
        console.log('  + created shift_authorizations table');
      } else {
        console.log('  - shift_authorizations table already exists');
      }

      // Create employee_notifications table if missing
      const hasNotificationsTable = await tenantDb.schema.hasTable('employee_notifications');
      if (!hasNotificationsTable) {
        await tenantDb.schema.createTable('employee_notifications', (table) => {
          table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
          table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
          table.string('title', 255).notNullable();
          table.text('message').notNullable();
          table.string('type', 50).notNullable().defaultTo('info');
          table.boolean('is_read').notNullable().defaultTo(false);
          table.string('link_url', 500).nullable();
          table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
        });
        console.log('  + created employee_notifications table');
      } else {
        console.log('  - employee_notifications table already exists');
        // Ensure link_url column exists on pre-existing employee_notifications tables
        const hasLinkUrl = await tenantDb.schema.hasColumn('employee_notifications', 'link_url');
        if (!hasLinkUrl) {
          await tenantDb.schema.alterTable('employee_notifications', (table) => {
            table.string('link_url', 500).nullable();
          });
          console.log('  + added link_url column to employee_notifications');
        } else {
          console.log('  - link_url column already exists');
        }
      }

      // Add status column to employee_shifts if missing
      const hasShiftStatus = await tenantDb.schema.hasColumn('employee_shifts', 'status');
      if (!hasShiftStatus) {
        await tenantDb.schema.alterTable('employee_shifts', (table) => {
          table.string('status', 20).notNullable().defaultTo('open');
        });
        console.log('  + added status column to employee_shifts');
      } else {
        console.log('  - status column already exists on employee_shifts');
      }

      // Add check_in_status column to employee_shifts if missing
      const hasCheckInStatus = await tenantDb.schema.hasColumn('employee_shifts', 'check_in_status');
      if (!hasCheckInStatus) {
        await tenantDb.schema.alterTable('employee_shifts', (table) => {
          table.string('check_in_status', 20).nullable();
        });
        console.log('  + added check_in_status column to employee_shifts');
      } else {
        console.log('  - check_in_status column already exists on employee_shifts');
      }

      // Add overtime_type column to shift_authorizations if missing
      const hasOvertimeType = await tenantDb.schema.hasColumn('shift_authorizations', 'overtime_type');
      if (!hasOvertimeType) {
        await tenantDb.schema.alterTable('shift_authorizations', (table) => {
          table.string('overtime_type', 50).nullable();
        });
        console.log('  + added overtime_type column to shift_authorizations');
      } else {
        console.log('  - overtime_type column already exists on shift_authorizations');
      }

      // Add new columns to authorization_requests if missing
      const arColumns: { col: string; add: (table: any) => void }[] = [
        { col: 'level', add: (t) => t.string('level', 20).notNullable().defaultTo('management') },
        { col: 'reference', add: (t) => t.string('reference', 255).nullable() },
        { col: 'requested_amount', add: (t) => t.decimal('requested_amount', 12, 2).nullable() },
        { col: 'bank_name', add: (t) => t.string('bank_name', 255).nullable() },
        { col: 'account_name', add: (t) => t.string('account_name', 255).nullable() },
        { col: 'account_number', add: (t) => t.string('account_number', 255).nullable() },
        { col: 'rejection_reason', add: (t) => t.text('rejection_reason').nullable() },
        { col: 'created_by_name', add: (t) => t.string('created_by_name', 255).nullable() },
      ];
      for (const { col, add } of arColumns) {
        const hasCol = await tenantDb.schema.hasColumn('authorization_requests', col);
        if (!hasCol) {
          await tenantDb.schema.alterTable('authorization_requests', add);
          console.log(`  + added ${col} column to authorization_requests`);
        } else {
          console.log(`  - ${col} column already exists on authorization_requests`);
        }
      }

      // Add new columns to cash_requests if missing
      const crColumns: { col: string; add: (table: any) => void }[] = [
        { col: 'request_type', add: (t) => t.string('request_type', 100).nullable() },
        { col: 'reference', add: (t) => t.string('reference', 255).nullable() },
        { col: 'bank_name', add: (t) => t.string('bank_name', 255).nullable() },
        { col: 'account_name', add: (t) => t.string('account_name', 255).nullable() },
        { col: 'account_number', add: (t) => t.string('account_number', 255).nullable() },
        { col: 'attachment_url', add: (t) => t.string('attachment_url', 500).nullable() },
        { col: 'rejection_reason', add: (t) => t.text('rejection_reason').nullable() },
        { col: 'created_by_name', add: (t) => t.string('created_by_name', 255).nullable() },
        { col: 'disbursed_by', add: (t) => t.uuid('disbursed_by').nullable().references('id').inTable('users') },
        { col: 'disbursed_at', add: (t) => t.timestamp('disbursed_at').nullable() },
      ];
      for (const { col, add } of crColumns) {
        const hasCol = await tenantDb.schema.hasColumn('cash_requests', col);
        if (!hasCol) {
          await tenantDb.schema.alterTable('cash_requests', add);
          console.log(`  + added ${col} column to cash_requests`);
        } else {
          console.log(`  - ${col} column already exists on cash_requests`);
        }
      }

      // Add closing_reports to pos_sessions if missing
      const hasClosingReports = await tenantDb.schema.hasColumn('pos_sessions', 'closing_reports');
      if (!hasClosingReports) {
        await tenantDb.schema.alterTable('pos_sessions', (table) => {
          table.jsonb('closing_reports').nullable();
        });
        console.log('  + added closing_reports to pos_sessions');
      } else {
        console.log('  - closing_reports already exists on pos_sessions');
      }

      // Add is_main_branch to branches if missing
      const hasIsMainBranch = await tenantDb.schema.hasColumn('branches', 'is_main_branch');
      if (!hasIsMainBranch) {
        await tenantDb.schema.alterTable('branches', (table) => {
          table.boolean('is_main_branch').notNullable().defaultTo(false);
        });
        console.log('  + added is_main_branch to branches');
      } else {
        console.log('  - is_main_branch already exists on branches');
      }

      // Seed new permissions if missing and grant to Administrator + Management
      const newPermissions = [
        { key: 'shift.view_all', name: 'View All', category: 'shifts' },
        { key: 'admin.toggle_branch', name: 'Toggle Branch', category: 'admin' },
        { key: 'shift.approve_authorizations', name: 'Approve Authorizations', category: 'shifts' },
        { key: 'shift.end_shift', name: 'End Shift', category: 'shifts' },
        { key: 'auth_request.approve_management', name: 'Approve Management Request', category: 'auth_requests' },
        { key: 'auth_request.view_all', name: 'View All Authorization Requests', category: 'auth_requests' },
        { key: 'auth_request.approve_service_crew', name: 'Approve Service Crew Requests', category: 'auth_requests' },
      ];
      for (const perm of newPermissions) {
        let record = await tenantDb('permissions').where({ key: perm.key }).first();
        if (!record) {
          const [inserted] = await tenantDb('permissions')
            .insert({ key: perm.key, name: perm.name, description: `Permission: ${perm.key}`, category: perm.category })
            .returning('*');
          record = inserted;
          console.log(`  + seeded permission: ${perm.key}`);
        } else {
          console.log(`  - permission ${perm.key} already exists`);
        }
        // Always ensure the permission is granted to Administrator + Management
        const roles = await tenantDb('roles').whereIn('name', ['Administrator', 'Management']);
        for (const role of roles) {
          const alreadyHas = await tenantDb('role_permissions')
            .where({ role_id: role.id, permission_id: record.id })
            .first();
          if (!alreadyHas) {
            await tenantDb('role_permissions').insert({ role_id: role.id, permission_id: record.id });
            console.log(`    + granted ${perm.key} to ${role.name}`);
          }
        }
      }

      // Seed cash_request permissions — grant only to Administrator
      const cashRequestPermissions = [
        { key: 'cash_request.view_all', name: 'View All Cash Requests', category: 'cash_requests' },
        { key: 'cash_request.approve', name: 'Approve Cash Requests', category: 'cash_requests' },
      ];
      for (const perm of cashRequestPermissions) {
        let record = await tenantDb('permissions').where({ key: perm.key }).first();
        if (!record) {
          const [inserted] = await tenantDb('permissions')
            .insert({ key: perm.key, name: perm.name, description: `Permission: ${perm.key}`, category: perm.category })
            .returning('*');
          record = inserted;
          console.log(`  + seeded permission: ${perm.key}`);
        } else {
          console.log(`  - permission ${perm.key} already exists`);
        }
        // Grant only to Administrator
        const adminRole = await tenantDb('roles').where({ name: 'Administrator' }).first();
        if (adminRole) {
          const alreadyHas = await tenantDb('role_permissions')
            .where({ role_id: adminRole.id, permission_id: record.id })
            .first();
          if (!alreadyHas) {
            await tenantDb('role_permissions').insert({ role_id: adminRole.id, permission_id: record.id });
            console.log(`    + granted ${perm.key} to Administrator`);
          }
        }
      }

      // Add new auth request permissions - grant to Administrator + Management
      const authRequestPermissions = [
        { key: 'account.submit_private_auth_request', name: 'Submit Private Auth Request', category: 'account' },
        { key: 'account.submit_public_auth_request', name: 'Submit Public Auth Request', category: 'account' },
      ];
      for (const perm of authRequestPermissions) {
        let record = await tenantDb('permissions').where({ key: perm.key }).first();
        if (!record) {
          const [inserted] = await tenantDb('permissions')
            .insert({ key: perm.key, name: perm.name, description: `Permission: ${perm.key}`, category: perm.category })
            .returning('*');
          record = inserted;
          console.log(`  + seeded permission: ${perm.key}`);
        } else {
          console.log(`  - permission ${perm.key} already exists`);
        }
        // Grant to Administrator + Management
        const roles = await tenantDb('roles').whereIn('name', ['Administrator', 'Management']);
        for (const role of roles) {
          const alreadyHas = await tenantDb('role_permissions')
            .where({ role_id: role.id, permission_id: record.id })
            .first();
          if (!alreadyHas) {
            await tenantDb('role_permissions').insert({ role_id: role.id, permission_id: record.id });
            console.log(`    + granted ${perm.key} to ${role.name}`);
          }
        }
      }

      // Remove deprecated permissions
      const deprecatedPermissions = [
        'auth_request.create_management',
        'auth_request.view_service_crew',
      ];
      for (const permKey of deprecatedPermissions) {
        const permRecord = await tenantDb('permissions').where({ key: permKey }).first();
        if (permRecord) {
          // First remove from role_permissions
          await tenantDb('role_permissions').where({ permission_id: permRecord.id }).delete();
          // Then remove from permissions
          await tenantDb('permissions').where({ id: permRecord.id }).delete();
          console.log(`  - removed deprecated permission: ${permKey}`);
        }
      }

      // Add new columns to users table for personal details
      const userColumns: { col: string; add: (table: any) => void }[] = [
        { col: 'mobile_number', add: (t) => t.string('mobile_number', 20).nullable() },
        { col: 'legal_name', add: (t) => t.string('legal_name', 255).nullable() },
        { col: 'birthday', add: (t) => t.date('birthday').nullable() },
        { col: 'gender', add: (t) => t.string('gender', 10).nullable() },
        { col: 'updated', add: (t) => t.boolean('updated').notNullable().defaultTo(false) },
        { col: 'pin', add: (t) => t.string('pin', 10).nullable() },
      ];
      for (const { col, add } of userColumns) {
        const hasCol = await tenantDb.schema.hasColumn('users', col);
        if (!hasCol) {
          await tenantDb.schema.alterTable('users', add);
          console.log(`  + added ${col} column to users`);
        } else {
          console.log(`  - ${col} column already exists on users`);
        }
      }

      console.log(`  Done: ${company.db_name}`);
    } catch (err) {
      console.error(`  ERROR on ${company.db_name}:`, err);
    }
  }

  await db.destroyAll();
  console.log('\nMigration complete.');
}

migrateTenantsDb().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

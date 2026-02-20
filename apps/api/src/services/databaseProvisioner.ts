import { db } from '../config/database.js';
import {
  ALL_PERMISSIONS,
  PERMISSION_CATEGORIES,
  SYSTEM_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_ROLE_COLORS,
  DEFAULT_ROLE_PRIORITIES,
} from '@omnilert/shared';
import { hashPassword } from '../utils/password.js';
import { logger } from '../utils/logger.js';
import { migrateTenantDb } from './tenantMigration.service.js';

export interface AdminSeed {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  passwordHash?: string;
}

export async function provisionTenantDatabase(dbName: string, admin: AdminSeed): Promise<void> {
  logger.info(`Provisioning tenant database: ${dbName}`);

  // Create the database
  await db.createDatabase(dbName);

  // Get connection to the new database
  const tenantDb = await db.getTenantDb(dbName);

  // Run migrations inline (create all tables)
  await createTenantTables(tenantDb);

  // Seed default data
  await seedDefaultData(tenantDb);

  // Create initial admin user
  await seedAdminUser(tenantDb, admin);

  // Ensure tenant DB is tracked by versioned tenant migrations.
  await migrateTenantDb(tenantDb);

  logger.info(`Tenant database ${dbName} provisioned successfully`);
}

async function createTenantTables(tenantDb: ReturnType<typeof db.getMasterDb>): Promise<void> {
  // Enable UUID extension
  await tenantDb.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // Permissions
  await tenantDb.schema.createTable('permissions', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.string('key', 100).notNullable().unique();
    table.string('name', 255).notNullable();
    table.text('description');
    table.string('category', 100).notNullable();
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
  });

  // Roles
  await tenantDb.schema.createTable('roles', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.string('name', 100).notNullable().unique();
    table.text('description');
    table.string('color', 7);
    table.boolean('is_system').notNullable().defaultTo(false);
    table.integer('priority').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(tenantDb.fn.now());
  });

  // Role Permissions
  await tenantDb.schema.createTable('role_permissions', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.uuid('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
    table
      .uuid('permission_id')
      .notNullable()
      .references('id')
      .inTable('permissions')
      .onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
    table.unique(['role_id', 'permission_id']);
  });

  // Users
  await tenantDb.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('avatar_url', 500);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('last_login_at');
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(tenantDb.fn.now());
  });

  // User Roles
  await tenantDb.schema.createTable('user_roles', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
    table.uuid('assigned_by').references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
    table.unique(['user_id', 'role_id']);
  });

  // Refresh Tokens
  await tenantDb.schema.createTable('refresh_tokens', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token_hash', 255).notNullable();
    table.timestamp('expires_at').notNullable();
    table.boolean('is_revoked').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
  });

  // Branches
  await tenantDb.schema.createTable('branches', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.text('address');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.boolean('is_main_branch').notNullable().defaultTo(false);
    table.string('odoo_branch_id', 100);
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(tenantDb.fn.now());
  });

  // User Branches
  await tenantDb.schema.createTable('user_branches', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
    table.boolean('is_primary').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
    table.unique(['user_id', 'branch_id']);
  });

  // POS Verifications
  await tenantDb.schema.createTable('pos_verifications', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table.jsonb('odoo_payload').notNullable();
    table.string('title', 500);
    table.text('description');
    table.decimal('amount', 12, 2);
    table.string('status', 20).notNullable().defaultTo('pending');
    table.string('verification_type', 50); // 'cf_breakdown' | 'pcf_breakdown' | 'discount_order' | null
    table.uuid('cashier_user_id').nullable(); // for discount_order: the cashier who made the order
    table.uuid('customer_user_id').nullable(); // for token_pay_order: the customer who pays with tokens
    table.text('customer_rejection_reason').nullable(); // filled when customer rejects token_pay_order
    table.jsonb('breakdown'); // [{denomination, quantity}] | null
    table.uuid('reviewed_by').references('id').inTable('users');
    table.timestamp('reviewed_at');
    table.text('review_notes');
    table.integer('audit_rating'); // 1–5
    table.text('audit_details');
    table.uuid('audited_by').nullable().references('id').inTable('users');
    table.timestamp('audited_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(tenantDb.fn.now());
  });

  // POS Verification Images
  await tenantDb.schema.createTable('pos_verification_images', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table
      .uuid('pos_verification_id')
      .notNullable()
      .references('id')
      .inTable('pos_verifications')
      .onDelete('CASCADE');
    table.uuid('uploaded_by').notNullable().references('id').inTable('users');
    table.string('file_path', 500).notNullable();
    table.string('file_name', 255).notNullable();
    table.string('mime_type', 100).notNullable();
    table.integer('file_size');
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
  });

  // POS Sessions
  await tenantDb.schema.createTable('pos_sessions', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table.string('odoo_session_id', 100);
    table.jsonb('odoo_payload').notNullable();
    table.string('session_name', 255);
    table.timestamp('opened_at');
    table.timestamp('closed_at');
    table.string('status', 20).notNullable().defaultTo('open');
    table.jsonb('closing_reports').nullable();
    table.uuid('audited_by').references('id').inTable('users');
    table.timestamp('audited_at');
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(tenantDb.fn.now());
  });

  // Add pos_session_id FK to pos_verifications (after pos_sessions exists)
  await tenantDb.schema.alterTable('pos_verifications', (table) => {
    table.uuid('pos_session_id').references('id').inTable('pos_sessions').nullable();
  });

  // Schedules
  await tenantDb.schema.createTable('schedules', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table.date('shift_date').notNullable();
    table.time('start_time').notNullable();
    table.time('end_time').notNullable();
    table.string('status', 20).notNullable().defaultTo('scheduled');
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(tenantDb.fn.now());
  });

  // Employee Shifts
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
    table.string('status', 20).notNullable().defaultTo('open');
    table.string('check_in_status', 20).nullable();
    table.jsonb('odoo_payload').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(tenantDb.fn.now());
    table.unique(['odoo_shift_id', 'branch_id']);
  });

  // Shift Logs
  await tenantDb.schema.createTable('shift_logs', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.uuid('shift_id').nullable().references('id').inTable('employee_shifts');
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table.string('log_type', 30).notNullable(); // 'shift_updated' | 'check_in' | 'check_out'
    table.jsonb('changes').nullable();
    table.integer('odoo_attendance_id').nullable();
    table.timestamp('event_time').notNullable();
    table.decimal('worked_hours', 8, 4).nullable();
    table.integer('cumulative_minutes').nullable();
    table.jsonb('odoo_payload').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
  });

  // Shift Authorizations
  await tenantDb.schema.createTable('shift_authorizations', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.uuid('shift_id').notNullable().references('id').inTable('employee_shifts');
    table.uuid('shift_log_id').notNullable().references('id').inTable('shift_logs');
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table.uuid('user_id').nullable().references('id').inTable('users');
    table.string('auth_type', 50).notNullable(); // 'early_check_in' | 'tardiness' | 'early_check_out' | 'late_check_out'
    table.integer('diff_minutes').notNullable();
    table.boolean('needs_employee_reason').notNullable().defaultTo(false);
    table.string('status', 20).notNullable().defaultTo('pending'); // 'pending' | 'approved' | 'rejected' | 'no_approval_needed'
    table.text('employee_reason').nullable();
    table.text('rejection_reason').nullable();
    table.string('overtime_type', 50).nullable();
    table.uuid('resolved_by').nullable().references('id').inTable('users');
    table.timestamp('resolved_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
  });

  // Authorization Requests
  await tenantDb.schema.createTable('authorization_requests', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table.string('request_type', 50).notNullable();
    table.string('level', 20).notNullable().defaultTo('management'); // 'management' | 'service_crew'
    table.text('description');
    table.string('reference', 255).nullable();
    table.decimal('requested_amount', 12, 2).nullable();
    table.string('bank_name', 255).nullable();
    table.string('account_name', 255).nullable();
    table.string('account_number', 255).nullable();
    table.string('created_by_name', 255).nullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.text('rejection_reason').nullable();
    table.uuid('reviewed_by').references('id').inTable('users');
    table.timestamp('reviewed_at');
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(tenantDb.fn.now());
  });

  // Cash Requests
  await tenantDb.schema.createTable('cash_requests', (table) => {
    table.uuid('id').primary().defaultTo(tenantDb.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table.string('request_type', 100).nullable();
    table.string('reference', 255).nullable();
    table.decimal('amount', 12, 2).notNullable();
    table.text('reason');
    table.string('bank_name', 255).nullable();
    table.string('account_name', 255).nullable();
    table.string('account_number', 255).nullable();
    table.string('attachment_url', 500).nullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.text('rejection_reason').nullable();
    table.string('created_by_name', 255).nullable();
    table.uuid('reviewed_by').references('id').inTable('users');
    table.timestamp('reviewed_at');
    table.timestamp('created_at').notNullable().defaultTo(tenantDb.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(tenantDb.fn.now());
  });

  // Add disbursed columns to cash_requests (migration for existing DBs)
  if (!(await tenantDb.schema.hasColumn('cash_requests', 'disbursed_by'))) {
    await tenantDb.schema.alterTable('cash_requests', (table) => {
      table.uuid('disbursed_by').nullable().references('id').inTable('users');
      table.timestamp('disbursed_at').nullable();
    });
  }

  // Employee Notifications
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
}

async function seedDefaultData(tenantDb: ReturnType<typeof db.getMasterDb>): Promise<void> {
  // Seed permissions
  const permissionRows: { key: string; name: string; description: string; category: string }[] =
    [];
  for (const [category, config] of Object.entries(PERMISSION_CATEGORIES)) {
    for (const permKey of config.permissions) {
      permissionRows.push({
        key: permKey,
        name: permKey
          .split('.')
          .pop()!
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        description: `Permission: ${permKey}`,
        category,
      });
    }
  }
  await tenantDb('permissions').insert(permissionRows);

  // Get inserted permissions for mapping
  const permissions = await tenantDb('permissions').select('id', 'key');
  const permMap = new Map(permissions.map((p: { id: string; key: string }) => [p.key, p.id]));

  // Seed system roles
  for (const roleName of Object.values(SYSTEM_ROLES)) {
    const [role] = await tenantDb('roles')
      .insert({
        name: roleName,
        description: `System role: ${roleName}`,
        color: DEFAULT_ROLE_COLORS[roleName],
        is_system: true,
        priority: DEFAULT_ROLE_PRIORITIES[roleName],
      })
      .returning('id');

    // Assign permissions to role
    const rolePermissions = DEFAULT_ROLE_PERMISSIONS[roleName];
    if (rolePermissions) {
      const rolePermRows = rolePermissions
        .map((permKey: string) => {
          const permId = permMap.get(permKey);
          if (!permId) return null;
          return { role_id: role.id, permission_id: permId };
        })
        .filter((row: unknown): row is { role_id: string; permission_id: string } => row !== null);

      if (rolePermRows.length > 0) {
        await tenantDb('role_permissions').insert(rolePermRows);
      }
    }
  }
}

async function seedAdminUser(
  tenantDb: ReturnType<typeof db.getMasterDb>,
  admin: AdminSeed,
): Promise<void> {
  const passwordHash = admin.passwordHash ?? (admin.password ? await hashPassword(admin.password) : null);
  if (!passwordHash) {
    throw new Error('Admin seed requires password or passwordHash');
  }

  const [user] = await tenantDb('users')
    .insert({
      email: admin.email,
      password_hash: passwordHash,
      first_name: admin.firstName,
      last_name: admin.lastName,
    })
    .returning('id');

  // Assign Administrator role
  const adminRole = await tenantDb('roles')
    .where({ name: SYSTEM_ROLES.ADMINISTRATOR })
    .first();

  if (adminRole) {
    await tenantDb('user_roles').insert({
      user_id: user.id,
      role_id: adminRole.id,
    });
  }

  logger.info(`Admin user ${admin.email} created with Administrator role`);
}

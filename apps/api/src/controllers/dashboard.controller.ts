import type { Request, Response, NextFunction } from 'express';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { getEmployeeByWebsiteUserKey, getEmployeePayslipData, createViewOnlyPayslip, getEmployeeEPIData, getEmployeeAuditRatings, getAllEmployeesWithEPI } from '../services/odoo.service.js';

export async function getPerformanceIndex(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;
    const currentUser = await tenantDb('users').where({ id: userId }).select('user_key').first();
    const userKey = currentUser?.user_key as string | undefined;

    if (!userKey) {
      res.json({ success: true, data: null });
      return;
    }

    // Get page from query params (default 1)
    const pageParam = req.query.page as string | undefined;
    const page = pageParam ? parseInt(pageParam, 10) : 1;

    // Get employee EPI data using website user ID
    const epiData = await getEmployeeEPIData(userKey);

    if (!epiData) {
      res.json({ success: true, data: null });
      return;
    }

    // Get audit ratings with pagination using x_website_key
    const auditRatings = await getEmployeeAuditRatings(userKey, page);

    // Return the EPI data with audit ratings
    res.json({ 
      success: true, 
      data: {
        id: epiData.id,
        employee_id: epiData.employee_id,
        x_epi: epiData.x_epi,
        x_average_sqaa: epiData.x_average_sqaa,
        x_average_scsa: epiData.x_average_scsa,
        auditRatings: auditRatings.items,
        pagination: auditRatings.pagination,
        currentUserEmployeeId: epiData.id,
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getPayslip(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    // Get companyId (Odoo company ID) from query params
    const companyIdParam = req.query.companyId as string | undefined;
    
    if (!companyIdParam) {
      throw new AppError(400, "companyId is required");
    }
    
    const odooCompanyId = parseInt(companyIdParam, 10);
    
    if (isNaN(odooCompanyId)) {
      throw new AppError(400, "Invalid companyId");
    }

    // Get cutoff from query params (1 or 2)
    const cutoffParam = req.query.cutoff as string | undefined;
    const cutoff = cutoffParam ? parseInt(cutoffParam, 10) : undefined;
    if (cutoff && cutoff !== 1 && cutoff !== 2) {
      throw new AppError(400, "Invalid cutoff. Must be 1 or 2.");
    }

    // Get the user key from tenant user record
    const userId = req.user!.sub;
    const currentUser = await tenantDb('users').where({ id: userId }).select('user_key').first();
    const userKey = currentUser?.user_key as string | undefined;

    if (!userKey) {
      logger.warn(`No user_key set for user ID: ${userId}`);
      res.json({ success: true, data: null });
      return;
    }

    // Search for employee by x_website_key and company_id
    const employee = await getEmployeeByWebsiteUserKey(userKey, odooCompanyId);

    if (!employee) {
      logger.warn(`No employee found for user ID: ${userId}`);
      res.json({ success: true, data: null });
      return;
    }

    // Try to get existing payslip, if not found, create a new one
    logger.info(`Getting payslip for employee ${employee.id}, company ${odooCompanyId}, cutoff ${cutoff || 'auto'}`);
    let payslip = await getEmployeePayslipData(employee.id, odooCompanyId, cutoff);

    if (!payslip) {
      logger.info(`No payslip found, attempting to create view-only payslip for employee ${employee.id}`);
      try {
        payslip = await createViewOnlyPayslip(employee.id, odooCompanyId, employee.name, cutoff);
        logger.info(`Successfully created view-only payslip ${payslip.id} for employee ${employee.id}`);
      } catch (createError) {
        logger.error(`Failed to create view-only payslip: ${createError}`);
        res.json({ 
          success: false, 
          error: "Unable to create payslip. Employee may not have an active contract." 
        });
        return;
      }
    }

    // Transform payslip data for frontend

    // Format period: "Feb 01, 2026 to Feb 15, 2026"
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    };
    const period = `${formatDate(payslip.date_from)} to ${formatDate(payslip.date_to)}`;

    // Transform attendance (worked_days)
    const attendanceItems: Array<{ name: string; days: number; hours: number; amount: number }> = [];
    let totalDays = 0;
    let totalHours = 0;
    let totalAmount = 0;

    if (payslip.worked_days) {
      for (const wd of payslip.worked_days) {
        attendanceItems.push({
          name: wd.name,
          days: wd.number_of_days || 0,
          hours: wd.number_of_hours || 0,
          amount: wd.amount || 0,
        });
        totalDays += wd.number_of_days || 0;
        totalHours += wd.number_of_hours || 0;
        totalAmount += wd.amount || 0;
      }
    }

    // Transform salary lines into 3 categories
    const taxable: Array<{ description: string; amount: number }> = [];
    const nonTaxable: Array<{ description: string; amount: number }> = [];
    const deductions: Array<{ description: string; amount: number }> = [];

    let inTaxableSection = false;
    let inNonTaxableSection = false;
    let inDeductionsSection = false;

    // Track OTHERINC to combine them
    let otherIncomeTotal = 0;

    // Track net pay
    let netPay = 0;

    if (payslip.lines) {
      for (const line of payslip.lines) {
        const name = line.name?.trim() || '';
        const amount = line.total || 0;
        const code = line.code;

        // Get net pay
        if (code === 'NET') {
          netPay = amount;
          continue;
        }

        // Skip empty names
        if (!name) continue;

        // Track section boundaries
        if (name.startsWith('TAXABLE SALARY')) {
          inTaxableSection = true;
          inNonTaxableSection = false;
          inDeductionsSection = false;
          continue;
        }
        if (name.startsWith('NON-TAXABLE SALARY')) {
          inTaxableSection = false;
          inNonTaxableSection = true;
          inDeductionsSection = false;
          continue;
        }
        if (name.startsWith('DEDUCTIONS')) {
          inTaxableSection = false;
          inNonTaxableSection = false;
          inDeductionsSection = true;
          continue;
        }
        if (name.startsWith('Total ')) {
          inTaxableSection = false;
          inNonTaxableSection = false;
          inDeductionsSection = false;
          continue;
        }

        // Skip title rows
        if (code?.startsWith('TITLE')) continue;

        // Combine OTHERINC into "Other Income"
        if (code === 'OTHERINC') {
          otherIncomeTotal += amount;
          continue;
        }

        // Add to appropriate section
        if (inTaxableSection && amount !== 0) {
          taxable.push({ description: name, amount });
        } else if (inNonTaxableSection && amount !== 0) {
          nonTaxable.push({ description: name, amount });
        } else if (inDeductionsSection && amount !== 0) {
          deductions.push({ description: name, amount });
        }
      }
    }

    // Add combined Other Income to non-taxable
    if (otherIncomeTotal !== 0) {
      nonTaxable.push({ description: 'Other Income', amount: otherIncomeTotal });
    }

    const formattedData = {
      period,
      employee: {
        name: payslip.employee_id[1],
      },
      attendance: {
        items: attendanceItems,
        totalDays,
        totalHours,
        totalAmount,
      },
      salary: {
        taxable,
        nonTaxable,
        deductions,
      },
      netPay,
    };

    res.json({ success: true, data: formattedData });
  } catch (err) {
    next(err);
  }
}

export async function getEPILeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    // Get companyId from query params (optional, default 1)
    const companyIdParam = req.query.companyId as string | undefined;
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : 1;

    // Get all employees with EPI > 0
    const topEmployees = await getAllEmployeesWithEPI(companyId);

    res.json({ success: true, data: topEmployees });
  } catch (err) {
    next(err);
  }
}

export async function getPayslipBranches(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const branches = await tenantDb('branches')
      .select('id', 'name', 'odoo_branch_id', 'is_active')
      .orderBy('name');

    res.json({ success: true, data: branches });
  } catch (err) {
    next(err);
  }
}

import { Badge } from '@/shared/components/ui/Badge';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { CompanyAvatar } from './CompanyAvatar';

export interface Company {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  isRoot: boolean;
  themeColor: string;
  companyCode: string | null;
  odooApiKey: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CompanyCardProps {
  company: Company;
  onSelect: (company: Company) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function CompanyCard({ company, onSelect }: CompanyCardProps) {
  return (
    <button
      type="button"
      className="w-full text-left"
      onClick={() => onSelect(company)}
    >
      <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <CompanyAvatar
                name={company.name}
                logoUrl={company.logoUrl}
                themeColor={company.themeColor}
                size={16}
                className="mt-0.5 shrink-0"
              />
              <span className="truncate font-semibold text-gray-900">{company.name}</span>
            </div>
            <Badge variant={company.isActive ? 'success' : 'danger'}>
              {company.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          <div className="mt-3 space-y-1">
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-600">Slug:</span> {company.slug}
            </p>
            {company.companyCode ? (
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-600">Code:</span>{' '}
                <span className="font-mono">{company.companyCode}</span>
              </p>
            ) : null}
            <p className="text-xs text-gray-400">Created {formatDate(company.createdAt)}</p>
          </div>
        </CardBody>
      </Card>
    </button>
  );
}

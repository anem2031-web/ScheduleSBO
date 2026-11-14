import { describe, expect, it } from 'vitest';
import { navigationForUser } from '@shared/navigation';

describe('WhatsApp delivery navigation', () => {
  const contains = (user: Parameters<typeof navigationForUser>[0]) => navigationForUser(user).some(item => item.key === 'whatsappDelivery');
  it('shows the page to admin and authorized organization-wide HR only', () => {
    expect(contains({role:'admin',permissions:['*']})).toBe(true);
    expect(contains({role:'hr_admin',permissions:['schedule:approve'],accessScope:null})).toBe(true);
    expect(contains({role:'hr_admin',permissions:['schedule:approve'],accessScope:{costCenterIds:[1]}})).toBe(false);
    expect(contains({role:'hr_admin',permissions:['schedule:read'],accessScope:null})).toBe(false);
    expect(contains({role:'supervisor',permissions:['schedule:approve']})).toBe(false);
  });
});

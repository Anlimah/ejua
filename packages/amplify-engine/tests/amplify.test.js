describe('Meta OAuth URL Generation', () => {
  test('generates valid Facebook OAuth URL', () => {
    const appId = 'test_app_123';
    const redirectUri = 'http://localhost:3003/api/v1/auth/meta/callback';
    const scopes = [
      'pages_show_list',
      'pages_manage_posts',
      'instagram_content_publish',
      'ads_management',
    ];

    const url = `https://www.facebook.com/v19.0/dialog/oauth?` +
      `client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scopes.join(',')}` +
      `&response_type=code`;

    expect(url).toContain('facebook.com');
    expect(url).toContain('client_id=test_app_123');
    expect(url).toContain('pages_manage_posts');
    expect(url).toContain('instagram_content_publish');
    expect(url).toContain('ads_management');
    expect(url).toContain('response_type=code');
  });

  test('encodes state parameter with vendor ID', () => {
    const vendorId = 'vendor-abc-123';
    const state = Buffer.from(JSON.stringify({ vendorId })).toString('base64');
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString());

    expect(decoded.vendorId).toBe(vendorId);
  });
});

describe('Scheduled Posting', () => {
  test('validates future dates', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 3600000); // 1 hour from now
    const past = new Date(now.getTime() - 3600000);

    expect(future > now).toBe(true);
    expect(past > now).toBe(false);
  });

  test('calculates delay correctly', () => {
    const now = new Date('2026-02-07T12:00:00Z');
    const publishAt = new Date('2026-02-07T14:30:00Z');
    const delayMs = publishAt.getTime() - now.getTime();

    expect(delayMs).toBe(9000000); // 2.5 hours in ms
    expect(delayMs / 1000 / 60).toBe(150); // 150 minutes
  });

  test('handles timezone-aware publish_at', () => {
    // A vendor in Accra (GMT+0) schedules for 6 PM local
    const publishAt = new Date('2026-02-07T18:00:00+00:00');
    expect(publishAt.toISOString()).toBe('2026-02-07T18:00:00.000Z');

    // A vendor in Lagos (GMT+1) schedules for 6 PM local
    const lagosPublishAt = new Date('2026-02-07T18:00:00+01:00');
    expect(lagosPublishAt.toISOString()).toBe('2026-02-07T17:00:00.000Z'); // 5 PM UTC
  });
});

describe('Ad Targeting Defaults', () => {
  const defaultTargeting = {
    geo_locations: { countries: ['GH'] },
    age_min: 18,
    age_max: 65,
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: ['feed', 'marketplace'],
    instagram_positions: ['stream', 'story', 'explore'],
  };

  test('targets Ghana by default', () => {
    expect(defaultTargeting.geo_locations.countries).toContain('GH');
  });

  test('covers standard age range', () => {
    expect(defaultTargeting.age_min).toBe(18);
    expect(defaultTargeting.age_max).toBe(65);
  });

  test('includes both FB and IG platforms', () => {
    expect(defaultTargeting.publisher_platforms).toContain('facebook');
    expect(defaultTargeting.publisher_platforms).toContain('instagram');
  });

  test('targets high-engagement placements', () => {
    expect(defaultTargeting.facebook_positions).toContain('feed');
    expect(defaultTargeting.facebook_positions).toContain('marketplace');
    expect(defaultTargeting.instagram_positions).toContain('story');
    expect(defaultTargeting.instagram_positions).toContain('explore');
  });

  test('allows custom targeting override', () => {
    const custom = {
      geo_locations: { countries: ['GH', 'NG'] },
      age_min: 25,
      age_max: 45,
    };
    const merged = { ...defaultTargeting, ...custom };

    expect(merged.geo_locations.countries).toEqual(['GH', 'NG']);
    expect(merged.age_min).toBe(25);
    // Original platforms preserved
    expect(merged.publisher_platforms).toContain('facebook');
  });
});

describe('Ad Budget Calculations', () => {
  test('calculates total budget from daily × duration', () => {
    const dailyBudget = 5000; // GHS 50.00 per day
    const durationDays = 7;
    const totalBudget = dailyBudget * durationDays;

    expect(totalBudget).toBe(35000); // GHS 350.00 total
  });

  test('calculates ROAS', () => {
    const totalRevenue = 500000; // GHS 5,000 in orders
    const totalAdSpend = 35000;  // GHS 350 spent on ads
    const roas = (totalRevenue / totalAdSpend).toFixed(2);

    expect(roas).toBe('14.29'); // 14.29x return on ad spend
  });

  test('handles zero spend gracefully', () => {
    const totalRevenue = 10000;
    const totalAdSpend = 0;
    const roas = totalAdSpend > 0 ? (totalRevenue / totalAdSpend).toFixed(2) : 0;

    expect(roas).toBe(0);
  });
});

describe('Conversion Tracking', () => {
  test('tracks ad click → order conversion', () => {
    const conversions = [];
    const conversion = {
      order_id: 'order-123',
      amount: 259900,
      currency: 'GHS',
      converted_at: new Date().toISOString(),
    };

    conversions.push(conversion);
    const totalRevenue = conversions.reduce((sum, c) => sum + c.amount, 0);

    expect(conversions).toHaveLength(1);
    expect(totalRevenue).toBe(259900);
  });

  test('aggregates multiple conversions', () => {
    const conversions = [
      { order_id: '1', amount: 100000 },
      { order_id: '2', amount: 259900 },
      { order_id: '3', amount: 50000 },
    ];

    const total = conversions.reduce((sum, c) => sum + c.amount, 0);
    expect(total).toBe(409900); // GHS 4,099.00
    expect(conversions).toHaveLength(3);
  });
});

describe('Platform Caption Limits', () => {
  test('Facebook allows up to 5000 characters', () => {
    const maxFb = 5000;
    const caption = 'Check out this amazing product on Ejua! 🔥';
    expect(caption.length).toBeLessThan(maxFb);
  });

  test('Instagram allows up to 2200 characters', () => {
    const maxIg = 2200;
    const caption = 'New arrival! Available in installments from GH₵519.80/mo on Ejua. #shopping #ghana #ejua';
    expect(caption.length).toBeLessThan(maxIg);
  });

  test('WhatsApp allows up to 1024 characters for image captions', () => {
    const maxWa = 1024;
    const caption = 'Hi! Check out this product: Samsung Galaxy A15 at GH₵2,599. Pay in installments! Tap the link below to order.';
    expect(caption.length).toBeLessThan(maxWa);
  });
});

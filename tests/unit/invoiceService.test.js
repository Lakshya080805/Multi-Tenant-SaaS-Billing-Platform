import { invoiceService } from '../../src/services/invoiceService.js';

describe('invoiceService.calculateInvoiceTotals', () => {
	test('single line item', () => {
		const lineItems = [
			{
				description: 'Design work',
				quantity: 2,
				unitPrice: 100,
				taxRate: 10
			}
		];

		const result = invoiceService.calculateInvoiceTotals(lineItems);

		expect(result).toEqual({
			subtotal: 200,
			taxTotal: 20,
			total: 220
		});
	});

	test('multiple line items', () => {
		const lineItems = [
			{
				description: 'Development',
				quantity: 2,
				unitPrice: 100,
				taxRate: 10
			},
			{
				description: 'Consulting',
				quantity: 1,
				unitPrice: 300,
				taxRate: 5
			}
		];

		const result = invoiceService.calculateInvoiceTotals(lineItems);

		expect(result).toEqual({
			subtotal: 500,
			taxTotal: 35,
			total: 535
		});
	});

	test('tax calculation', () => {
		const lineItems = [
			{
				description: 'Service A',
				quantity: 3,
				unitPrice: 150,
				taxRate: 18
			}
		];

		const result = invoiceService.calculateInvoiceTotals(lineItems);

		expect(result.subtotal).toBe(450);
		expect(result.taxTotal).toBe(81);
		expect(result.total).toBe(531);
	});

	test('empty array', () => {
		const result = invoiceService.calculateInvoiceTotals([]);

		expect(result).toEqual({
			subtotal: 0,
			taxTotal: 0,
			total: 0
		});
	});
});

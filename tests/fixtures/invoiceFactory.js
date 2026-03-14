export function createInvoicePayload(overrides = {}) {
	return {
		clientId: 'test-client-id',
		invoiceNumber: 'INV-TEST-001',
		lineItems: [
			{
				description: 'Test service',
				quantity: 2,
				unitPrice: 500,
				taxRate: 18
			}
		],
		issueDate: '2026-03-14',
		dueDate: '2026-03-21',
		...overrides
	};
}

export default createInvoicePayload;

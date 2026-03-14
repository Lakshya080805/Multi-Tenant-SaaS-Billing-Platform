import { jest } from '@jest/globals';

const findByIdMock = jest.fn();
const updateByIdMock = jest.fn();
const deleteByIdMock = jest.fn();

await jest.unstable_mockModule('../../src/models/invoiceModel.js', () => ({
	invoiceModel: {
		findById: findByIdMock,
		updateById: updateByIdMock,
		deleteById: deleteByIdMock,
		findByOrganization: jest.fn(),
		create: jest.fn()
	}
}));

await jest.unstable_mockModule('../../src/models/clientModel.js', () => ({
	clientModel: {
		findById: jest.fn()
	}
}));

const { invoiceService } = await import('../../src/services/invoiceService.js');

describe('invoice service guard logic', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	test('update invoice when status is paid should throw error', async () => {
		findByIdMock.mockResolvedValue({
			id: 'inv_paid_1',
			organizationId: 'org_1',
			status: 'paid',
			lineItems: [],
			clientId: 'client_1',
			invoiceNumber: 'INV-PAID-1',
			currency: 'USD'
		});

		await expect(
			invoiceService.updateInvoice('inv_paid_1', { notes: 'try update' }, 'org_1')
		).rejects.toMatchObject({
			statusCode: 400,
			message: 'Paid invoice cannot be modified'
		});

		expect(updateByIdMock).not.toHaveBeenCalled();
	});

	test('delete invoice when status is paid should throw error', async () => {
		findByIdMock.mockResolvedValue({
			id: 'inv_paid_2',
			organizationId: 'org_1',
			status: 'paid'
		});

		await expect(
			invoiceService.deleteInvoice('inv_paid_2', 'org_1')
		).rejects.toMatchObject({
			statusCode: 400,
			message: 'Paid invoice cannot be deleted'
		});

		expect(deleteByIdMock).not.toHaveBeenCalled();
	});

	test('cancelled invoice cannot be modified', async () => {
		findByIdMock.mockResolvedValue({
			id: 'inv_cancelled_1',
			organizationId: 'org_1',
			status: 'cancelled',
			lineItems: [],
			clientId: 'client_1',
			invoiceNumber: 'INV-CANCELLED-1',
			currency: 'USD'
		});

		await expect(
			invoiceService.updateInvoice('inv_cancelled_1', { notes: 'try update' }, 'org_1')
		).rejects.toMatchObject({
			statusCode: 400,
			message: 'Cancelled invoice cannot be modified'
		});

		expect(updateByIdMock).not.toHaveBeenCalled();
	});
});

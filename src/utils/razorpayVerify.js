import crypto from 'crypto';

export function verifyRazorpaySignature(
	razorpayOrderId,
	razorpayPaymentId,
	razorpaySignature,
	secret
) {
	const generatedSignature = crypto
		.createHmac('sha256', secret)
		.update(`${razorpayOrderId}|${razorpayPaymentId}`)
		.digest('hex');

	return generatedSignature === razorpaySignature;
}

export default verifyRazorpaySignature;

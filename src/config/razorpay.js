import Razorpay from 'razorpay';

const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy';
const keySecret = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_dummy_secret';

export const razorpay = new Razorpay({
	key_id: keyId,
	key_secret: keySecret
});

export default razorpay;

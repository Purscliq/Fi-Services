import {config} from 'dotenv'
import { Request, Response } from "express"
import axios from 'axios'
import { decodeToken } from "../utils/decode_token"
import { KYC } from "../../models/KYC"
import { JwtPayload } from "jsonwebtoken"
import { ReasonPhrases, StatusCodes } from "http-status-codes"
import { sendSMS } from '../utils/send_sms'
import { generateOTP } from '../utils/generate_otp'

config();

const liveKey = process.env.verifyMeKey as string;

// Verify user via BVN
export const bvnVerification = async (req:Request, res:Response) => {
    // Get user token from auth header
    const authHeader = req.headers.authorization as string
    const userPayload = decodeToken(authHeader.split(" ")[1]) as JwtPayload

    // Get KYC details
    const { 
            firstName, 
            lastName, 
            BVN, 
            DOB, 
            otherName, 
            phoneNumber,
            address,
            state,
            city,
            country,
            postalCode, 
            gender, 
            nationality, 
            idType, 
            idNumber,
            expiryDate
        } = req.body

    // PERFORM KYC
    try {
        const url = `https://vapi.verifyme.ng/v1/verifications/identities/bvn/${BVN}`

        const headers = {
            authorization: `Bearer ${liveKey}`,
            'Content-Type': 'application/json'
        }
        
        const data = {
            firstname: firstName,
            lastname: lastName,
            othernames: otherName,
            dob: DOB
        }

        const response = await axios.post(url, data, { headers })
        const info = response.data.data

        if((info.firstname).toLowerCase() !== firstName.toLowerCase() || (info.lastname).toLowerCase() !== lastName.toLowerCase())
            return res.status(StatusCodes.NOT_FOUND).json({ message: "KYC did not pass" })

        // Save KYC details to DB
        const kycData = {
            user: userPayload.userId, 
            firstName, 
            lastName,
            BVN, 
            DOB,
            otherName,
            phoneNumber, 
            address,
            state,
            city,
            country,
            postalCode,
            gender, 
            nationality, 
            idType, 
            idNumber,  
            expiryDate
        }

        const kyc = new KYC(kycData);

        // SEND OTP TO PHONE NUMBER (Phone Number verification)
        const OTP = generateOTP();

        const smsStatus = await sendSMS(phoneNumber, OTP); 

        kyc.status = "active";

        kyc.OTP = OTP;

        await kyc.save();

        // return result
        return res.status(StatusCodes.OK).json({ 
            Success: ReasonPhrases.OK, 
            message: "An OTP has been sent to your phone number", 
            smsStatus, 
            result: info
        })
    } catch(error: any) {
        console.log(error)
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(ReasonPhrases.INTERNAL_SERVER_ERROR)
    }
}


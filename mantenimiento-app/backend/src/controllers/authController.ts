import { Request, Response } from 'express';
import { googleSheetsService } from '../services/googleSheets';
import { generateToken } from '../middleware/auth';
import { UserCreateInput } from '../types';

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { fullName, email, phone } = req.body as UserCreateInput;

    // Check if user already exists
    let user = await googleSheetsService.getUserByEmail(email);

    if (user) {
      // User exists, log them in
      await googleSheetsService.updateUserLastLogin(user.id);

      const token = generateToken({
        userId: user.id,
        email: user.email,
      });

      res.json({
        success: true,
        data: {
          token,
          user,
          isNewUser: false,
        },
        message: `¡Bienvenido de nuevo, ${user.fullName.split(' ')[0]}!`,
      });
      return;
    }

    // Create new user
    user = await googleSheetsService.createUser({
      fullName,
      email,
      phone,
    });

    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    res.status(201).json({
      success: true,
      data: {
        token,
        user,
        isNewUser: true,
      },
      message: `¡Bienvenido a Mantenimiento, ${user.fullName.split(' ')[0]}!`,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo completar el registro. Por favor intenta de nuevo.',
    });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;

    const user = await googleSheetsService.getUserByEmail(email);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'No encontramos una cuenta con ese correo. ¿Quieres registrarte?',
      });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({
        success: false,
        error: 'Tu cuenta está desactivada. Contacta al administrador.',
      });
      return;
    }

    await googleSheetsService.updateUserLastLogin(user.id);

    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    res.json({
      success: true,
      data: {
        token,
        user,
      },
      message: `¡Hola de nuevo, ${user.fullName.split(' ')[0]}!`,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo iniciar sesión. Por favor intenta de nuevo.',
    });
  }
}

export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'No autenticado',
      });
      return;
    }

    const user = await googleSheetsService.getUserById(req.user.userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
      return;
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener información del usuario',
    });
  }
}

export async function validateToken(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        valid: false,
      });
      return;
    }

    const user = await googleSheetsService.getUserById(req.user.userId);

    if (!user || user.status !== 'active') {
      res.status(401).json({
        success: false,
        valid: false,
      });
      return;
    }

    res.json({
      success: true,
      valid: true,
      data: user,
    });
  } catch (error) {
    console.error('Validate token error:', error);
    res.status(401).json({
      success: false,
      valid: false,
    });
  }
}

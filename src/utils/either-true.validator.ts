import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'IsEitherTrue', async: false })
export class IsEitherTrue implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    const relatedValue = (args.object as any)[relatedPropertyName];
    return !(value && relatedValue);
  }

  defaultMessage(args: ValidationArguments) {
    return 'Only one delivery option can be selected';
  }
}

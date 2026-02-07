export type StdbPrimitiveType =
    | "I8" | "U8"
    | "I16" | "U16"
    | "I32" | "U32" | "F32"
    | "I64" | "U64" | "F64"
    | "I128" | "U128"
    | "U256"
    | "Bool"
    | "String";

export type StdbComplexType = "Array" | "Ref" | "Product" | "Sum" | "Option";

export type StdbType = StdbPrimitiveType | StdbComplexType;

export interface RustOption<T> {
    some?: T;
    none?: Record<string, never>;
}

// Algebraic type is a discriminated union - only one key will be present
export type AlgebraicType =
    | { [K in StdbPrimitiveType]?: Record<string, never> }
    | { Array: AlgebraicType }
    | { Ref: number }
    | { Product: { elements: AlgebraicTypeElement[] } }
    | { Sum: { variants: { name: RustOption<string>; algebraic_type: AlgebraicType }[] } }
    | { Option: AlgebraicType };

export interface AlgebraicTypeElement {
    name: RustOption<string>;
    algebraic_type: AlgebraicType;
}

export interface RawReducer {
    name: string;
    lifecycle: RustOption<{
        OnDisconnect?: Record<string, never>;
        Init?: Record<string, never>;
        OnConnect?: Record<string, never>;
    }>;
    params: {
        elements: AlgebraicTypeElement[];
    };
}

export interface Typespace {
    types: {
        Product?: {
            elements: AlgebraicTypeElement[];
        };
        Sum?: {
            variants: { name: RustOption<string>; algebraic_type: AlgebraicType }[];
        };
    }[];
}

export interface TypeDef {
    name: {
        scope: unknown[];
        name: string;
    };
    ty: number;
    custom_ordering: boolean;
}

export interface RawSchema {
    tables: { name: string; product_type_ref: number }[];
    reducers: RawReducer[];
    typespace: Typespace;
    types: TypeDef[];
}

export interface LogLine {
    level: string;
    ts: Date;
    target: string;
    filename: string;
    line_number: number;
    message: string;
}

export interface ParsedParam {
    name: string;
    type: string;
    fullType: string;
}

export interface ParsedTable {
    name: string;
    columns: ParsedParam[];
}

export interface ParsedReducer {
    name: string;
    params: ParsedParam[];
    lifecycle: "Init" | "OnDisconnect" | "OnConnect" | null;
}

export interface ToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
}
